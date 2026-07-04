create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  whatsapp text not null,
  country text not null,
  city text not null,
  gender text not null,
  age_range text not null,
  church text,
  learning_mode text not null,
  skill_pathway text not null,
  reason text not null,
  referral_source text not null,
  consent boolean not null default false,
  amount numeric not null,
  currency text not null,
  amount_display text,
  payment_reference text not null constraint registrations_payment_reference_key unique,
  payment_status text not null,
  paid_at timestamptz,
  paystack_customer_email text,
  paystack_raw jsonb,
  metadata jsonb
);

-- The unique constraint above creates the required unique payment-reference index.
create index if not exists registrations_email_idx on public.registrations (email);
create index if not exists registrations_created_at_idx on public.registrations (created_at);
create index if not exists registrations_skill_pathway_idx on public.registrations (skill_pathway);
create index if not exists registrations_learning_mode_idx on public.registrations (learning_mode);

alter table public.registrations enable row level security;

-- No public policies are created. Backend access uses the server-only service role.
