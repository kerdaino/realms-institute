-- REALMS August 2026 operational update.
-- Review and apply manually immediately before deploying the matching application code.
-- The matching code selects these columns/tables and should not be deployed first.

alter table public.registrations
  add column if not exists admission_offer_at timestamptz,
  add column if not exists admission_payment_deadline timestamptz,
  add column if not exists admission_outstanding_amount numeric,
  add column if not exists admission_confirmed_at timestamptz,
  add column if not exists admission_offer_lapsed_at timestamptz,
  add column if not exists payment_deadline_extended_at timestamptz,
  add column if not exists payment_deadline_extended_by text,
  add column if not exists payment_deadline_extension_reason text,
  add column if not exists late_entry_required boolean not null default false,
  add column if not exists late_entry_flagged_at timestamptz;

alter table public.registrations
  drop constraint if exists registrations_application_status_check,
  add constraint registrations_application_status_check check (application_status in (
    'pending_review',
    'conditional_admission_payment_outstanding',
    'admitted',
    'admission_offer_lapsed_payment_outstanding',
    'contacted',
    'waitlisted',
    'not_admitted'
  )) not valid,
  drop constraint if exists registrations_admission_outstanding_amount_check,
  add constraint registrations_admission_outstanding_amount_check
    check (admission_outstanding_amount is null or admission_outstanding_amount > 0) not valid;

alter table public.registrations
  validate constraint registrations_application_status_check,
  validate constraint registrations_admission_outstanding_amount_check;

create index if not exists registrations_conditional_admission_deadline_idx
  on public.registrations (admission_payment_deadline)
  where application_status = 'conditional_admission_payment_outstanding' and deleted_at is null;

create table if not exists public.registration_communication_events (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete restrict,
  communication_type text not null check (communication_type in (
    'conditional_admission_offer', 'admission_confirmed', 'admission_offer_lapsed', 'payment_deadline_extended'
  )),
  recipient_email text not null,
  subject_snapshot text not null,
  content_snapshot jsonb not null default '{}'::jsonb,
  delivery_status text not null check (delivery_status in ('attempted', 'sent', 'failed')),
  provider_message_id text,
  provider_error text,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists registration_communication_events_registration_idx
  on public.registration_communication_events (registration_id, created_at desc);
alter table public.registration_communication_events enable row level security;
revoke all on public.registration_communication_events from anon, authenticated;

-- Cohort events can now preserve a known date without inventing a clock time.
alter table public.cohort_events
  add column if not exists event_date date;
update public.cohort_events
set event_date = (scheduled_start_at at time zone coalesce(timezone, 'Africa/Lagos'))::date
where event_date is null and scheduled_start_at is not null;
alter table public.cohort_events alter column scheduled_start_at drop not null;
alter table public.cohort_events
  drop constraint if exists cohort_events_event_type_check,
  drop constraint if exists cohort_events_schedule_check,
  drop constraint if exists cohort_events_scheduled_end_at_check,
  add constraint cohort_events_event_type_check check (event_type in ('orientation', 'prayer_matriculation', 'orientation_matriculation', 'cohort_activity')),
  add constraint cohort_events_schedule_check check (event_date is not null or scheduled_start_at is not null),
  add constraint cohort_events_scheduled_end_at_check check (scheduled_end_at is null or (scheduled_start_at is not null and scheduled_end_at > scheduled_start_at));

create table if not exists public.institutional_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  audience text not null check (audience in ('students', 'facilitators', 'students_facilitators')),
  cohort_id uuid references public.cohorts(id) on delete restrict,
  all_active_cohorts boolean not null default false,
  student_discipleship_route text,
  student_skill_pathway text,
  student_learning_mode text,
  call_to_action_label text,
  call_to_action_url text,
  publish_to_portal boolean not null default true,
  send_email boolean not null default false,
  announcement_status text not null default 'draft' check (announcement_status in ('draft', 'published', 'archived')),
  pinned_until timestamptz,
  expires_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cohort_id is not null or all_active_cohorts),
  check ((call_to_action_url is null and call_to_action_label is null) or (call_to_action_url is not null and call_to_action_label is not null)),
  check (expires_at is null or pinned_until is null or pinned_until <= expires_at)
);

create table if not exists public.institutional_announcement_recipients (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.institutional_announcements(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('student', 'facilitator')),
  student_id uuid references public.students(id) on delete restrict,
  facilitator_id uuid references public.facilitators(id) on delete restrict,
  recipient_name_snapshot text not null,
  recipient_email_snapshot text not null,
  cohort_id uuid references public.cohorts(id) on delete restrict,
  explicit_selection boolean not null default false,
  email_status text not null default 'not_requested' check (email_status in ('not_requested', 'pending', 'sent', 'failed')),
  email_attempt_count integer not null default 0 check (email_attempt_count >= 0),
  email_provider_message_id text,
  email_error_internal text,
  email_last_attempted_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  check ((recipient_type = 'student' and student_id is not null and facilitator_id is null) or (recipient_type = 'facilitator' and facilitator_id is not null and student_id is null)),
  unique (announcement_id, recipient_type, student_id, facilitator_id)
);

create index if not exists institutional_announcements_status_idx
  on public.institutional_announcements (announcement_status, published_at desc);
create index if not exists institutional_announcement_student_recipient_idx
  on public.institutional_announcement_recipients (student_id, announcement_id) where student_id is not null;
create index if not exists institutional_announcement_facilitator_recipient_idx
  on public.institutional_announcement_recipients (facilitator_id, announcement_id) where facilitator_id is not null;
create index if not exists institutional_announcement_failed_email_idx
  on public.institutional_announcement_recipients (announcement_id, email_status) where email_status = 'failed';
create unique index if not exists institutional_announcement_student_recipient_uidx
  on public.institutional_announcement_recipients (announcement_id, student_id) where student_id is not null;
create unique index if not exists institutional_announcement_facilitator_recipient_uidx
  on public.institutional_announcement_recipients (announcement_id, facilitator_id) where facilitator_id is not null;

alter table public.institutional_announcements enable row level security;
alter table public.institutional_announcement_recipients enable row level security;
revoke all on public.institutional_announcements, public.institutional_announcement_recipients from anon, authenticated;

-- All writes and recipient-list reads remain service-role owned after server-side
-- admin or portal-role authorisation. No browser-writable policy is added.
