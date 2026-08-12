-- REALMS per-cohort public registration control and private late invites.
-- REVIEW AND APPLY MANUALLY before deploying the matching application code.
-- This file is not executed by the application and does not close registration.

do $$
begin
  if not exists (select 1 from public.cohorts where code = 'RSD-AUG-2026') then
    raise exception 'RSD_AUG_2026_COHORT_REQUIRED';
  end if;
end
$$;

alter table public.cohorts
  add column if not exists registration_status text not null default 'closed',
  add column if not exists registration_opens_at timestamptz,
  add column if not exists registration_closes_at timestamptz,
  add column if not exists is_public_registration_cohort boolean not null default false;

alter table public.cohorts
  drop constraint if exists cohorts_registration_status_check,
  drop constraint if exists cohorts_registration_window_check,
  add constraint cohorts_registration_status_check
    check (registration_status in ('open', 'closed')) not valid,
  add constraint cohorts_registration_window_check
    check (
      registration_opens_at is null
      or registration_closes_at is null
      or registration_closes_at > registration_opens_at
    ) not valid;

alter table public.cohorts validate constraint cohorts_registration_status_check;
alter table public.cohorts validate constraint cohorts_registration_window_check;

-- Preserve the currently open public experience after this migration is applied.
-- REALMS Admin will close RSD-AUG-2026 manually after the matching code is deployed.
update public.cohorts
set registration_status = 'open',
    is_public_registration_cohort = true,
    updated_at = now()
where code = 'RSD-AUG-2026';

create unique index if not exists cohorts_single_public_registration_idx
  on public.cohorts (is_public_registration_cohort)
  where is_public_registration_cohort;

create or replace function public.set_public_registration_cohort(target_cohort_id uuid)
returns public.cohorts
language plpgsql
security definer
set search_path = public
as $$
declare
  selected public.cohorts;
begin
  if target_cohort_id is null then
    raise exception 'TARGET_COHORT_REQUIRED';
  end if;
  perform pg_advisory_xact_lock(hashtext('REALMS_PUBLIC_REGISTRATION_COHORT'));
  select * into selected from public.cohorts where id = target_cohort_id for update;
  if selected.id is null then
    raise exception 'COHORT_NOT_FOUND';
  end if;
  update public.cohorts
  set is_public_registration_cohort = (id = target_cohort_id), updated_at = now()
  where is_public_registration_cohort or id = target_cohort_id;
  select * into selected from public.cohorts where id = target_cohort_id;
  return selected;
end;
$$;

revoke all on function public.set_public_registration_cohort(uuid) from public, anon, authenticated;
grant execute on function public.set_public_registration_cohort(uuid) to service_role;

alter table public.registrations
  add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;

update public.registrations as registrations
set cohort_id = cohorts.id
from public.cohorts as cohorts
where registrations.cohort_id is null
  and cohorts.code = registrations.cohort_code;

create index if not exists registrations_cohort_id_created_at_idx
  on public.registrations (cohort_id, created_at desc);

create table if not exists public.late_registration_invites (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete restrict,
  applicant_email text not null,
  applicant_name text,
  token_hash text not null unique,
  token_ciphertext text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by text,
  consumed_at timestamptz,
  consumed_registration_id uuid references public.registrations(id) on delete restrict,
  created_by text not null,
  created_at timestamptz not null default now(),
  check (char_length(token_hash) = 64),
  check (expires_at > created_at),
  check (consumed_at is null or revoked_at is null)
);

alter table public.registrations
  add column if not exists late_registration_invite_id uuid
    references public.late_registration_invites(id) on delete restrict;

create unique index if not exists late_registration_invites_consumed_registration_uidx
  on public.late_registration_invites (consumed_registration_id)
  where consumed_registration_id is not null;
create unique index if not exists registrations_late_registration_invite_uidx
  on public.registrations (late_registration_invite_id)
  where late_registration_invite_id is not null;
create index if not exists late_registration_invites_cohort_created_idx
  on public.late_registration_invites (cohort_id, created_at desc);
create index if not exists late_registration_invites_active_expiry_idx
  on public.late_registration_invites (expires_at)
  where revoked_at is null and consumed_at is null;

alter table public.late_registration_invites enable row level security;
revoke all on public.late_registration_invites from anon, authenticated;

create or replace function public.enforce_new_registration_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_cohort public.cohorts;
  invite public.late_registration_invites;
begin
  -- During a migration-first deployment, the previous application version still
  -- supplies cohort_code. Resolve cohort_id so that brief overlap stays open.
  if new.cohort_id is null then
    select * into target_cohort from public.cohorts where code = new.cohort_code;
    new.cohort_id := target_cohort.id;
  else
    select * into target_cohort from public.cohorts where id = new.cohort_id;
  end if;
  if target_cohort.id is null or target_cohort.code <> new.cohort_code then
    raise exception 'REGISTRATION_COHORT_INVALID';
  end if;

  if new.late_registration_invite_id is not null then
    select * into invite
    from public.late_registration_invites
    where id = new.late_registration_invite_id
    for update;
    if invite.id is null
      or invite.cohort_id <> new.cohort_id
      or lower(btrim(invite.applicant_email)) <> lower(btrim(new.email))
      or invite.expires_at <= now()
      or invite.revoked_at is not null
      or invite.consumed_at is not null then
      raise exception 'LATE_REGISTRATION_INVITE_INVALID';
    end if;
    return new;
  end if;

  if not target_cohort.is_public_registration_cohort
    or target_cohort.registration_status <> 'open'
    or (target_cohort.registration_opens_at is not null and now() < target_cohort.registration_opens_at)
    or (target_cohort.registration_closes_at is not null and now() >= target_cohort.registration_closes_at) then
    raise exception 'REGISTRATION_CLOSED';
  end if;
  return new;
end;
$$;

create or replace function public.consume_new_registration_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.late_registration_invite_id is null then return new; end if;
  update public.late_registration_invites
  set consumed_at = new.created_at,
      consumed_registration_id = new.id
  where id = new.late_registration_invite_id
    and consumed_at is null
    and revoked_at is null;
  if not found then raise exception 'LATE_REGISTRATION_INVITE_CONSUMPTION_FAILED'; end if;
  insert into public.audit_logs (action, entity_type, entity_id, metadata)
  values ('late_registration_invite_consumed', 'cohort', new.cohort_id, jsonb_build_object(
    'invite_id', new.late_registration_invite_id,
    'registration_id', new.id,
    'cohort_code', new.cohort_code,
    'actor', 'Late registration submission'
  ));
  return new;
end;
$$;

drop trigger if exists registrations_new_application_access_guard on public.registrations;
create trigger registrations_new_application_access_guard
  before insert on public.registrations
  for each row execute function public.enforce_new_registration_access();

drop trigger if exists registrations_late_invite_consumption on public.registrations;
create trigger registrations_late_invite_consumption
  after insert on public.registrations
  for each row execute function public.consume_new_registration_invite();

revoke all on function public.enforce_new_registration_access() from public, anon, authenticated;
revoke all on function public.consume_new_registration_invite() from public, anon, authenticated;

-- All cohort-control and invitation writes remain service-role owned after
-- server-side REALMS Admin authorisation. Raw invite tokens are never stored.
