-- REALMS Phase A / NEXT 5: cohort-wide events that must not be modelled as courses.
-- Apply separately before running the August 2026 calendar setup script.

create table if not exists public.cohort_events (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  event_key text not null,
  event_type text not null,
  title text not null,
  description text,
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz,
  timezone text not null default 'Africa/Lagos',
  delivery_mode text not null,
  live_join_url text,
  physical_location text,
  event_status text not null default 'scheduled',
  visibility_status text not null default 'enrolled_only',
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cohort_id, event_key),
  check (event_type in ('orientation_matriculation', 'cohort_activity')),
  check (delivery_mode in ('online', 'physical', 'hybrid')),
  check (event_status in ('scheduled', 'completed', 'cancelled')),
  check (visibility_status in ('enrolled_only', 'admin_only')),
  check (scheduled_end_at is null or scheduled_end_at > scheduled_start_at)
);

create index if not exists cohort_events_cohort_schedule_idx
  on public.cohort_events (cohort_id, scheduled_start_at);

alter table public.cohort_events enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cohort_events'
      and policyname = 'students read enrolled cohort events'
  ) then
    create policy "students read enrolled cohort events"
      on public.cohort_events for select
      to authenticated
      using (
        visibility_status = 'enrolled_only'
        and exists (
          select 1
          from public.student_enrollments
          join public.students on students.id = student_enrollments.student_id
          where student_enrollments.cohort_id = cohort_events.cohort_id
            and student_enrollments.enrolment_status in ('active', 'enrolled')
            and students.profile_id = auth.uid()
        )
      );
  end if;
end $$;

grant select (
  id, cohort_id, event_key, event_type, title, description,
  scheduled_start_at, scheduled_end_at, timezone, delivery_mode,
  live_join_url, physical_location, event_status, visibility_status,
  is_required, created_at, updated_at
) on public.cohort_events to authenticated;

-- No authenticated insert, update or delete policy is created. Calendar setup
-- and later administrative changes remain server/service-role operations.
