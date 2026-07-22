-- Build 13 public-endpoint abuse protection.
-- Apply separately before deploying the matching application code.

create table if not exists public.public_rate_limit_buckets (
  key_hash text primary key,
  action text not null,
  attempt_count integer not null check (attempt_count > 0),
  window_started_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint public_rate_limit_key_hash_format check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint public_rate_limit_action_length check (char_length(action) between 1 and 80)
);

create index if not exists public_rate_limit_buckets_expires_at_idx
  on public.public_rate_limit_buckets (expires_at);

alter table public.public_rate_limit_buckets enable row level security;
revoke all on table public.public_rate_limit_buckets from public, anon, authenticated;

create or replace function public.consume_public_rate_limit(
  p_key_hash text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  bucket public.public_rate_limit_buckets%rowtype;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$'
    or char_length(p_action) not between 1 and 80
    or p_limit not between 1 and 10000
    or p_window_seconds not between 1 and 604800 then
    raise exception 'Invalid public rate-limit input';
  end if;

  -- Opportunistic bounded cleanup keeps expired rows from growing forever.
  delete from public.public_rate_limit_buckets
  where key_hash in (
    select key_hash from public.public_rate_limit_buckets
    where expires_at <= v_now
    order by expires_at
    limit 200
  );

  insert into public.public_rate_limit_buckets as buckets
    (key_hash, action, attempt_count, window_started_at, expires_at, updated_at)
  values
    (p_key_hash, p_action, 1, v_now, v_now + make_interval(secs => p_window_seconds), v_now)
  on conflict (key_hash) do update
  set action = excluded.action,
      attempt_count = case when buckets.expires_at <= v_now then 1 else buckets.attempt_count + 1 end,
      window_started_at = case when buckets.expires_at <= v_now then v_now else buckets.window_started_at end,
      expires_at = case when buckets.expires_at <= v_now then v_now + make_interval(secs => p_window_seconds) else buckets.expires_at end,
      updated_at = v_now
  returning * into bucket;

  return jsonb_build_object(
    'allowed', bucket.attempt_count <= p_limit,
    'retry_after_seconds', case
      when bucket.attempt_count <= p_limit then 0
      else greatest(1, ceil(extract(epoch from bucket.expires_at - v_now)))::integer
    end
  );
end;
$$;

revoke all on function public.consume_public_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, text, integer, integer) to service_role;

comment on table public.public_rate_limit_buckets is
  'Expiring HMAC-keyed public request counters; contains no raw IP address or applicant email.';

-- An opaque, HMACed submission fingerprint makes browser/network retries
-- idempotent without storing the client token or applicant data in the key.
alter table public.registrations
  add column if not exists submission_key_hash text,
  add column if not exists payment_authorization_url text,
  add column if not exists payment_initialized_at timestamptz;

create unique index if not exists registrations_submission_key_hash_key
  on public.registrations (submission_key_hash)
  where submission_key_hash is not null;

alter table public.registrations
  drop constraint if exists registrations_submission_key_hash_format;

alter table public.registrations
  add constraint registrations_submission_key_hash_format
  check (submission_key_hash is null or submission_key_hash ~ '^[0-9a-f]{64}$') not valid;

alter table public.registrations validate constraint registrations_submission_key_hash_format;
