-- REALMS Institute LMS / SIS Build 6: attendance engine
-- Apply after lms_build_5_student_learning.sql.

alter table public.course_enrollments
  add column if not exists delivery_route text,
  add column if not exists delivery_route_status text not null default 'active',
  add column if not exists delivery_route_note text,
  add column if not exists delivery_route_approved_at timestamptz,
  add column if not exists delivery_route_approved_by text;

update public.course_enrollments as enrollment
set delivery_route = case
  when courses.course_category = 'discipleship' then 'DL'
  when student_enrollments.skill_learning_mode = 'online' then 'OL'
  else 'PL'
end
from public.student_enrollments, public.cohort_courses, public.courses
where student_enrollments.id = enrollment.student_enrollment_id
  and cohort_courses.id = enrollment.cohort_course_id
  and courses.id = cohort_courses.course_id
  and enrollment.delivery_route is null;

alter table public.course_enrollments alter column delivery_route set not null;
do $$ begin alter table public.course_enrollments add constraint course_enrollments_delivery_route_check check (delivery_route in ('PL', 'OL', 'RP', 'DL', 'DR-E')); exception when duplicate_object then null; end $$;

create table if not exists public.cohort_attendance_policies (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null unique references public.cohorts(id) on delete cascade,
  max_unapproved_absence_units numeric(6,2) not null default 3 check (max_unapproved_absence_units >= 0),
  late_threshold_minutes integer not null default 15 check (late_threshold_minutes >= 0),
  partial_missing_percentage numeric(5,2) not null default 25 check (partial_missing_percentage between 0 and 100),
  absent_missing_percentage numeric(5,2) not null default 50 check (absent_missing_percentage between 0 and 100),
  late_absence_weight numeric(4,2) not null default 0.5 check (late_absence_weight >= 0),
  partial_absence_weight numeric(4,2) not null default 0.5 check (partial_absence_weight >= 0),
  absent_absence_weight numeric(4,2) not null default 1 check (absent_absence_weight >= 0),
  policy_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.session_attendance (
  id uuid primary key default gen_random_uuid(),
  course_enrollment_id uuid not null references public.course_enrollments(id) on delete cascade,
  class_session_id uuid not null references public.class_sessions(id) on delete cascade,
  assigned_delivery_route text not null check (assigned_delivery_route in ('PL', 'OL', 'RP', 'DL', 'DR-E')),
  attendance_route_used text,
  attendance_status text not null default 'pending' check (attendance_status in ('pending', 'present', 'late', 'partial', 'absent', 'excused_absence', 'not_verified', 'pending_recorded_verification', 'verified_recorded_attendance')),
  first_roll_call text check (first_roll_call in ('present', 'late', 'absent', 'approved_absence', 'not_verified')),
  first_roll_marked_at timestamptz,
  first_roll_marked_by text,
  second_roll_call text check (second_roll_call in ('present', 'absent', 'approved_absence', 'not_verified')),
  second_roll_marked_at timestamptz,
  second_roll_marked_by text,
  actual_joined_at timestamptz,
  actual_left_at timestamptz,
  late_minutes integer check (late_minutes is null or late_minutes >= 0),
  left_early_minutes integer check (left_early_minutes is null or left_early_minutes >= 0),
  attendance_percentage numeric(5,2) check (attendance_percentage is null or attendance_percentage between 0 and 100),
  online_duration_minutes integer check (online_duration_minutes is null or online_duration_minutes >= 0),
  engagement_checks_expected integer not null default 0 check (engagement_checks_expected >= 0),
  engagement_checks_completed integer not null default 0 check (engagement_checks_completed >= 0),
  identity_verified boolean not null default false,
  connection_issue_reported boolean not null default false,
  online_evidence jsonb not null default '{}'::jsonb,
  absence_weight numeric(4,2) not null default 0 check (absence_weight >= 0),
  manual_override boolean not null default false,
  integrity_flag boolean not null default false,
  facilitator_note text,
  admin_note text,
  finalized_at timestamptz,
  finalized_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_enrollment_id, class_session_id)
);

create table if not exists public.session_learning_completion (
  id uuid primary key default gen_random_uuid(),
  course_enrollment_id uuid not null references public.course_enrollments(id) on delete cascade,
  class_session_id uuid not null references public.class_sessions(id) on delete cascade,
  completion_status text not null default 'not_started',
  completion_method text,
  required_action text,
  due_at timestamptz,
  completed_at timestamptz,
  verified_at timestamptz,
  verified_by text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_enrollment_id, class_session_id)
);

create table if not exists public.attendance_engagement_checks (
  id uuid primary key default gen_random_uuid(),
  session_attendance_id uuid not null references public.session_attendance(id) on delete cascade,
  check_type text not null check (check_type in ('poll', 'verbal_response', 'chat_response', 'reflection', 'camera_identity_check', 'practical_check', 'other')),
  result text,
  checked_at timestamptz not null default now(),
  note text,
  recorded_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_change_events (
  id uuid primary key default gen_random_uuid(),
  session_attendance_id uuid not null references public.session_attendance(id) on delete restrict,
  change_type text not null,
  previous_state jsonb,
  new_state jsonb,
  reason text not null check (length(trim(reason)) > 0),
  changed_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_route_change_events (
  id uuid primary key default gen_random_uuid(),
  course_enrollment_id uuid not null references public.course_enrollments(id) on delete restrict,
  previous_route text,
  new_route text not null check (new_route in ('PL', 'OL', 'RP', 'DL', 'DR-E')),
  reason text not null check (length(trim(reason)) > 0),
  changed_by text,
  created_at timestamptz not null default now()
);

create index if not exists session_attendance_session_idx on public.session_attendance(class_session_id);
create index if not exists session_attendance_status_idx on public.session_attendance(attendance_status, finalized_at);
create index if not exists session_learning_completion_session_idx on public.session_learning_completion(class_session_id);
create index if not exists attendance_change_events_attendance_idx on public.attendance_change_events(session_attendance_id, created_at desc);
create index if not exists route_change_events_enrollment_idx on public.delivery_route_change_events(course_enrollment_id, created_at desc);

create or replace function public.guard_session_attendance_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and old.finalized_at is not null then
    raise exception 'Finalized attendance requires an administrative correction';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists guard_session_attendance_update on public.session_attendance;
create trigger guard_session_attendance_update before update on public.session_attendance for each row execute function public.guard_session_attendance_update();

alter table public.cohort_attendance_policies enable row level security;
alter table public.session_attendance enable row level security;
alter table public.session_learning_completion enable row level security;
alter table public.attendance_engagement_checks enable row level security;
alter table public.attendance_change_events enable row level security;
alter table public.delivery_route_change_events enable row level security;

drop policy if exists "students read own cohort attendance policy" on public.cohort_attendance_policies;
create policy "students read own cohort attendance policy" on public.cohort_attendance_policies for select to authenticated using (
  exists (select 1 from public.student_enrollments join public.students on students.id = student_enrollments.student_id where student_enrollments.cohort_id = cohort_attendance_policies.cohort_id and students.profile_id = auth.uid())
);

drop policy if exists "students and assigned facilitators read attendance" on public.session_attendance;
create policy "students and assigned facilitators read attendance" on public.session_attendance for select to authenticated using (
  exists (select 1 from public.course_enrollments join public.student_enrollments on student_enrollments.id = course_enrollments.student_enrollment_id join public.students on students.id = student_enrollments.student_id where course_enrollments.id = session_attendance.course_enrollment_id and students.profile_id = auth.uid())
  or exists (select 1 from public.class_sessions where class_sessions.id = session_attendance.class_session_id and (class_sessions.facilitator_id in (select id from public.facilitators where profile_id = auth.uid()) or public.current_facilitator_assigned_to_offering(class_sessions.cohort_course_id)))
);

drop policy if exists "students and assigned facilitators read learning completion" on public.session_learning_completion;
create policy "students and assigned facilitators read learning completion" on public.session_learning_completion for select to authenticated using (
  exists (select 1 from public.course_enrollments join public.student_enrollments on student_enrollments.id = course_enrollments.student_enrollment_id join public.students on students.id = student_enrollments.student_id where course_enrollments.id = session_learning_completion.course_enrollment_id and students.profile_id = auth.uid())
  or exists (select 1 from public.class_sessions where class_sessions.id = session_learning_completion.class_session_id and (class_sessions.facilitator_id in (select id from public.facilitators where profile_id = auth.uid()) or public.current_facilitator_assigned_to_offering(class_sessions.cohort_course_id)))
);

drop policy if exists "assigned facilitators read engagement checks" on public.attendance_engagement_checks;
create policy "assigned facilitators read engagement checks" on public.attendance_engagement_checks for select to authenticated using (
  exists (select 1 from public.session_attendance join public.class_sessions on class_sessions.id = session_attendance.class_session_id where session_attendance.id = attendance_engagement_checks.session_attendance_id and (class_sessions.facilitator_id in (select id from public.facilitators where profile_id = auth.uid()) or public.current_facilitator_assigned_to_offering(class_sessions.cohort_course_id)))
);

-- Students have no INSERT, UPDATE, or DELETE policies for attendance data.
-- Facilitator mutations go through protected server routes after assignment
-- verification. Event-history tables have no normal authenticated write policy.
