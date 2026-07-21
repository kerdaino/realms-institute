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
  fee_policy_consent boolean not null default false,
  computer_access_confirmed boolean not null default false,
  amount numeric not null,
  currency text not null,
  public_fee_display text,
  amount_display text,
  exchange_note text,
  amount_paid numeric,
  payment_reference text constraint registrations_payment_reference_key unique,
  payment_status text not null,
  paid_at timestamptz,
  paystack_customer_email text,
  paystack_raw jsonb,
  metadata jsonb,
  application_status text not null default 'pending_review' check (application_status in ('pending_review', 'admitted', 'contacted', 'waitlisted', 'not_admitted')),
  admin_note text,
  reviewed_at timestamptz,
  reviewed_by text,
  applicant_type text not null default 'new_student',
  requested_discipleship_route text not null default 'foundational',
  assigned_discipleship_route text default 'foundational',
  advanced_entry_status text not null default 'not_applicable',
  alumni_verification_status text not null default 'not_applicable',
  alumni_review_note text,
  alumni_reviewed_at timestamptz,
  alumni_reviewed_by text,
  screening_status text not null default 'not_required',
  alumni_previous_cohort text,
  alumni_previous_email text,
  alumni_previous_phone text,
  alumni_student_id text,
  theological_institution text,
  theological_programme text,
  theological_duration text,
  theological_year_completed text,
  theological_qualification text,
  screening_answers jsonb not null default '{}'::jsonb,
  screening_objective_score integer,
  screening_objective_max integer not null default 50,
  screening_short_answer_1_score numeric,
  screening_short_answer_2_score numeric,
  screening_short_answer_score numeric,
  screening_short_answer_max integer not null default 50,
  screening_total_score numeric,
  screening_percentage numeric,
  screening_review_note text,
  screening_reviewed_at timestamptz,
  screening_reviewed_by text,
  funding_route text not null default 'self_pay',
  scholarship_status text not null default 'not_requested',
  scholarship_reason text,
  scholarship_financial_situation text,
  scholarship_can_contribute boolean,
  scholarship_contribution_amount numeric,
  scholarship_approved_amount numeric,
  scholarship_review_note text,
  scholarship_reviewed_at timestamptz,
  scholarship_reviewed_by text,
  admin_note_updated_at timestamptz,
  admin_note_updated_by text,
  confirmation_email_sent boolean not null default false,
  confirmation_email_sent_at timestamptz,
  admin_email_sent boolean not null default false,
  admin_email_sent_at timestamptz,
  scholarship_confirmation_email_sent boolean not null default false,
  scholarship_confirmation_email_sent_at timestamptz,
  scholarship_admin_email_sent boolean not null default false,
  scholarship_admin_email_sent_at timestamptz,
  admission_email_sent boolean not null default false,
  admission_email_sent_at timestamptz
);

-- Required migration for projects where registrations already exists.
alter table registrations
  add column if not exists fee_policy_consent boolean not null default false,
  add column if not exists computer_access_confirmed boolean not null default false,
  add column if not exists public_fee_display text,
  add column if not exists exchange_note text,
  add column if not exists application_status text not null default 'pending_review',
  add column if not exists admin_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text;

-- August 2026 programme architecture and pre-payment application support.
-- Values are validated in TypeScript/server code. No new database CHECK constraints are added yet.
alter table public.registrations
  add column if not exists amount_paid numeric,
  add column if not exists applicant_type text not null default 'new_student',
  add column if not exists requested_discipleship_route text not null default 'foundational',
  add column if not exists assigned_discipleship_route text default 'foundational',
  add column if not exists advanced_entry_status text not null default 'not_applicable',
  add column if not exists alumni_verification_status text not null default 'not_applicable',
  add column if not exists alumni_review_note text,
  add column if not exists alumni_reviewed_at timestamptz,
  add column if not exists alumni_reviewed_by text,
  add column if not exists screening_status text not null default 'not_required',
  add column if not exists alumni_previous_cohort text,
  add column if not exists alumni_previous_email text,
  add column if not exists alumni_previous_phone text,
  add column if not exists alumni_student_id text,
  add column if not exists theological_institution text,
  add column if not exists theological_programme text,
  add column if not exists theological_duration text,
  add column if not exists theological_year_completed text,
  add column if not exists theological_qualification text,
  add column if not exists screening_answers jsonb,
  add column if not exists screening_objective_score integer,
  add column if not exists screening_objective_max integer not null default 50,
  add column if not exists screening_short_answer_1_score numeric,
  add column if not exists screening_short_answer_2_score numeric,
  add column if not exists screening_short_answer_score numeric,
  add column if not exists screening_short_answer_max integer not null default 50,
  add column if not exists screening_total_score numeric,
  add column if not exists screening_percentage numeric,
  add column if not exists screening_review_note text,
  add column if not exists screening_reviewed_at timestamptz,
  add column if not exists screening_reviewed_by text,
  add column if not exists funding_route text not null default 'self_pay',
  add column if not exists scholarship_status text not null default 'not_requested',
  add column if not exists scholarship_reason text,
  add column if not exists scholarship_financial_situation text,
  add column if not exists scholarship_can_contribute boolean,
  add column if not exists scholarship_contribution_amount numeric,
  add column if not exists scholarship_approved_amount numeric,
  add column if not exists scholarship_review_note text,
  add column if not exists scholarship_reviewed_at timestamptz,
  add column if not exists scholarship_reviewed_by text,
  add column if not exists admin_note_updated_at timestamptz,
  add column if not exists admin_note_updated_by text;

update public.registrations
set screening_answers = '{}'::jsonb
where screening_answers is null;

update public.registrations
set
  screening_objective_max = coalesce(screening_objective_max, 50),
  screening_short_answer_max = coalesce(screening_short_answer_max, 50)
where screening_objective_max is null or screening_short_answer_max is null;

alter table public.registrations
  alter column screening_answers set default '{}'::jsonb,
  alter column screening_answers set not null,
  alter column screening_objective_max set default 50,
  alter column screening_objective_max set not null,
  alter column screening_short_answer_max set default 50,
  alter column screening_short_answer_max set not null;

alter table public.registrations alter column payment_reference drop not null;

-- Email tracking migration for projects where registrations already exists.
alter table public.registrations
  add column if not exists confirmation_email_sent boolean not null default false,
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists admin_email_sent boolean not null default false,
  add column if not exists admin_email_sent_at timestamptz,
  add column if not exists scholarship_confirmation_email_sent boolean not null default false,
  add column if not exists scholarship_confirmation_email_sent_at timestamptz,
  add column if not exists scholarship_admin_email_sent boolean not null default false,
  add column if not exists scholarship_admin_email_sent_at timestamptz,
  add column if not exists admission_email_sent boolean not null default false,
  add column if not exists admission_email_sent_at timestamptz;

-- The unique constraint above creates the required unique payment-reference index.
create index if not exists registrations_email_idx on public.registrations (email);
create index if not exists registrations_created_at_idx on public.registrations (created_at);
create index if not exists registrations_skill_pathway_idx on public.registrations (skill_pathway);
create index if not exists registrations_learning_mode_idx on public.registrations (learning_mode);

alter table public.registrations enable row level security;

create table if not exists public.registration_review_events (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  event_type text not null,
  previous_state jsonb,
  new_state jsonb,
  note text,
  actor text not null,
  created_at timestamptz not null default now()
);

alter table public.registration_review_events
  add column if not exists event_type text,
  add column if not exists previous_state jsonb,
  add column if not exists new_state jsonb,
  add column if not exists note text,
  add column if not exists actor text,
  add column if not exists created_at timestamptz;

-- Preserve audit history created by the earlier review-event shape, then allow
-- canonical-only inserts. Dynamic SQL keeps this migration safe for fresh projects
-- where the legacy columns never existed.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'registration_review_events'
      and column_name = 'review_type'
  ) then
    execute $migration$
      update public.registration_review_events
      set
        event_type = coalesce(
          event_type,
          case action
            when 'verify_alumni' then 'alumni_verified'
            when 'unable_to_verify' then 'alumni_not_verified'
            when 'approve_advanced' then 'advanced_entry_approved'
            when 'require_foundational' then 'foundation_required'
            when 'approve_full' then 'scholarship_approved_full'
            when 'approve_partial' then 'scholarship_approved_partial'
            when 'decline' then 'scholarship_declined'
            when 'request_more_information' then review_type || '_more_information_required'
            else action
          end,
          review_type,
          'review_event'
        ),
        note = coalesce(note, review_note),
        actor = coalesce(actor, reviewed_by, 'REALMS Admin'),
        created_at = coalesce(reviewed_at, created_at, now())
    $migration$;

    execute 'alter table public.registration_review_events alter column review_type drop not null';
    execute 'alter table public.registration_review_events alter column action drop not null';
    execute 'alter table public.registration_review_events alter column reviewed_by drop not null';
  end if;
end
$$;

update public.registration_review_events
set
  event_type = coalesce(event_type, 'review_event'),
  actor = coalesce(actor, 'REALMS Admin'),
  created_at = coalesce(created_at, now())
where event_type is null or actor is null or created_at is null;

alter table public.registration_review_events
  alter column event_type set not null,
  alter column actor set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists registration_review_events_registration_created_at_idx
  on public.registration_review_events (registration_id, created_at desc);

create unique index if not exists registration_review_events_payment_verified_reference_uidx
  on public.registration_review_events (registration_id, (new_state ->> 'payment_reference'))
  where event_type = 'payment_verified'
    and nullif(new_state ->> 'payment_reference', '') is not null;

create index if not exists registrations_applicant_type_idx on public.registrations (applicant_type);
create index if not exists registrations_requested_route_idx on public.registrations (requested_discipleship_route);
create index if not exists registrations_advanced_entry_status_idx on public.registrations (advanced_entry_status);
create index if not exists registrations_scholarship_status_idx on public.registrations (scholarship_status);

alter table public.registration_review_events enable row level security;

-- No public policies are created. Backend access uses the server-only service role.
