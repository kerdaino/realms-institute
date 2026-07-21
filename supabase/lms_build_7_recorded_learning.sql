-- REALMS Institute LMS / SIS Build 7: recorded learning and completion verification
-- Apply after lms_build_6_attendance.sql. All derived writes are owned by protected server routes.

create table if not exists public.recording_completion_policies (
  id uuid primary key default gen_random_uuid(), cohort_id uuid not null unique references public.cohorts(id) on delete cascade,
  min_watch_percentage numeric(5,2) not null default 85 check (min_watch_percentage between 1 and 100), default_deadline_hours integer not null default 72 check (default_deadline_hours > 0),
  default_required_checkpoints integer not null default 2 check (default_required_checkpoints >= 0), min_quiz_score numeric(5,2) not null default 70 check (min_quiz_score between 0 and 100), max_quiz_attempts integer not null default 2 check (max_quiz_attempts > 0),
  policy_status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

insert into public.recording_completion_policies (cohort_id)
select cohorts.id from public.cohorts
on conflict (cohort_id) do nothing;

create or replace function public.initialize_recording_completion_policy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.recording_completion_policies (cohort_id) values (new.id) on conflict (cohort_id) do nothing;
  return new;
end;
$$;
drop trigger if exists initialize_recording_completion_policy on public.cohorts;
create trigger initialize_recording_completion_policy after insert on public.cohorts for each row execute function public.initialize_recording_completion_policy();

create table if not exists public.session_recording_requirements (
  id uuid primary key default gen_random_uuid(), class_session_id uuid not null unique references public.class_sessions(id) on delete cascade,
  min_watch_percentage numeric(5,2), deadline_hours integer, requires_checkpoints boolean not null default true, required_checkpoint_count integer,
  requires_quiz boolean not null default false, requires_practical boolean not null default false, requires_reflection boolean not null default false, requires_oral_verification boolean not null default false,
  allow_late_completion boolean not null default true, requirement_status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.recording_learning_assignments (
  id uuid primary key default gen_random_uuid(), course_enrollment_id uuid not null references public.course_enrollments(id) on delete cascade, class_session_id uuid not null references public.class_sessions(id) on delete cascade, class_recording_id uuid not null references public.class_recordings(id) on delete cascade,
  purpose_code text not null check (purpose_code in ('REV','RP','DR-E','MU-E','MU-U')), assignment_status text not null default 'assigned', assigned_at timestamptz not null default now(), available_at timestamptz, due_at timestamptz, completed_at timestamptz, verified_at timestamptz, verified_by text, exception_note text, requirement_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (course_enrollment_id, class_recording_id, purpose_code)
);
alter table public.recording_learning_assignments add column if not exists requirement_snapshot jsonb not null default '{}'::jsonb;

create table if not exists public.recording_progress (
  id uuid primary key default gen_random_uuid(), recording_assignment_id uuid not null unique references public.recording_learning_assignments(id) on delete cascade,
  progress_status text not null default 'not_started', first_access_at timestamptz, last_access_at timestamptz, unique_watched_seconds integer not null default 0 check (unique_watched_seconds >= 0), watch_percentage numeric(5,2) not null default 0 check (watch_percentage between 0 and 100),
  watch_requirement_met boolean not null default false, checkpoint_requirement_met boolean not null default false, playback_session_count integer not null default 0 check (playback_session_count >= 0), completed_watch_at timestamptz, integrity_status text not null default 'clear', integrity_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.recording_playback_sessions (
  id uuid primary key default gen_random_uuid(), recording_assignment_id uuid not null references public.recording_learning_assignments(id) on delete cascade, started_at timestamptz not null default now(), ended_at timestamptz, last_heartbeat_at timestamptz,
  player_provider text, user_agent_summary text, playback_status text not null default 'active', created_at timestamptz not null default now()
);

create table if not exists public.recording_watch_segments (
  id uuid primary key default gen_random_uuid(), playback_session_id uuid not null references public.recording_playback_sessions(id) on delete cascade,
  segment_start_seconds numeric(12,3) not null check (segment_start_seconds >= 0), segment_end_seconds numeric(12,3) not null check (segment_end_seconds > segment_start_seconds), observed_wall_seconds numeric(12,3) not null check (observed_wall_seconds >= 0), playback_rate numeric(4,2) not null default 1 check (playback_rate between 0.5 and 2), created_at timestamptz not null default now()
);

create table if not exists public.recording_checkpoints (
  id uuid primary key default gen_random_uuid(), class_recording_id uuid not null references public.class_recordings(id) on delete cascade, title text not null, position_seconds numeric(12,3), position_percentage numeric(5,2), checkpoint_order integer not null default 1, is_required boolean not null default true, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check ((position_seconds is not null)::integer + (position_percentage is not null)::integer = 1)
);
alter table public.recording_checkpoints drop constraint if exists recording_checkpoints_check;
do $$ begin alter table public.recording_checkpoints add constraint recording_checkpoints_position_check check ((position_seconds is not null)::integer + (position_percentage is not null)::integer = 1); exception when duplicate_object then null; end $$;

create table if not exists public.recording_checkpoint_questions (
  id uuid primary key default gen_random_uuid(), checkpoint_id uuid not null references public.recording_checkpoints(id) on delete cascade, question_type text not null check (question_type in ('multiple_choice','true_false','short_answer')), prompt text not null, options jsonb not null default '[]'::jsonb, is_active boolean not null default true, sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.recording_checkpoint_answer_keys (
  id uuid primary key default gen_random_uuid(), question_id uuid not null unique references public.recording_checkpoint_questions(id) on delete cascade, correct_answer jsonb not null, explanation text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.recording_checkpoint_attempts (
  id uuid primary key default gen_random_uuid(), recording_assignment_id uuid not null references public.recording_learning_assignments(id) on delete cascade, checkpoint_id uuid not null references public.recording_checkpoints(id) on delete cascade, question_id uuid not null references public.recording_checkpoint_questions(id) on delete cascade,
  submitted_answer jsonb, is_correct boolean, attempt_number integer not null default 1 check (attempt_number > 0), answered_at timestamptz not null default now(), created_at timestamptz not null default now()
);

create table if not exists public.recording_requirement_statuses (
  id uuid primary key default gen_random_uuid(), recording_assignment_id uuid not null references public.recording_learning_assignments(id) on delete cascade, requirement_type text not null check (requirement_type in ('watch','checkpoints','quiz','practical','reflection','oral_verification')),
  is_required boolean not null default false, requirement_status text not null default 'pending', evidence_source text, evidence_reference text, completed_at timestamptz, verified_at timestamptz, verified_by text, verification_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (recording_assignment_id, requirement_type)
);

create table if not exists public.learning_completion_change_events (
  id uuid primary key default gen_random_uuid(), learning_completion_id uuid not null references public.session_learning_completion(id) on delete restrict, change_type text not null, previous_state jsonb, new_state jsonb, reason text not null check (length(trim(reason)) > 0), changed_by text, created_at timestamptz not null default now()
);

create index if not exists recording_assignment_session_idx on public.recording_learning_assignments(class_session_id, purpose_code);
create index if not exists recording_assignment_enrollment_idx on public.recording_learning_assignments(course_enrollment_id, due_at);
create index if not exists playback_assignment_idx on public.recording_playback_sessions(recording_assignment_id, started_at desc);
create index if not exists watch_segment_playback_idx on public.recording_watch_segments(playback_session_id, segment_start_seconds);
create index if not exists checkpoint_recording_idx on public.recording_checkpoints(class_recording_id, checkpoint_order);
create index if not exists checkpoint_attempt_assignment_idx on public.recording_checkpoint_attempts(recording_assignment_id, answered_at);
create index if not exists learning_change_completion_idx on public.learning_completion_change_events(learning_completion_id, created_at desc);

alter table public.recording_completion_policies enable row level security;
alter table public.session_recording_requirements enable row level security;
alter table public.recording_learning_assignments enable row level security;
alter table public.recording_progress enable row level security;
alter table public.recording_playback_sessions enable row level security;
alter table public.recording_watch_segments enable row level security;
alter table public.recording_checkpoints enable row level security;
alter table public.recording_checkpoint_questions enable row level security;
alter table public.recording_checkpoint_answer_keys enable row level security;
alter table public.recording_checkpoint_attempts enable row level security;
alter table public.recording_requirement_statuses enable row level security;
alter table public.learning_completion_change_events enable row level security;

drop policy if exists "students and assigned facilitators read recording policy" on public.recording_completion_policies;
create policy "students and assigned facilitators read recording policy" on public.recording_completion_policies for select to authenticated using (
  exists (select 1 from public.student_enrollments join public.students on students.id = student_enrollments.student_id where student_enrollments.cohort_id = recording_completion_policies.cohort_id and students.profile_id = auth.uid())
  or exists (select 1 from public.cohort_courses where cohort_courses.cohort_id = recording_completion_policies.cohort_id and public.current_facilitator_assigned_to_offering(cohort_courses.id))
);

drop policy if exists "students and assigned facilitators read session recording requirements" on public.session_recording_requirements;
create policy "students and assigned facilitators read session recording requirements" on public.session_recording_requirements for select to authenticated using (
  exists (select 1 from public.class_sessions join public.course_enrollments on course_enrollments.cohort_course_id = class_sessions.cohort_course_id join public.student_enrollments on student_enrollments.id = course_enrollments.student_enrollment_id join public.students on students.id = student_enrollments.student_id where class_sessions.id = session_recording_requirements.class_session_id and students.profile_id = auth.uid())
  or exists (select 1 from public.class_sessions where class_sessions.id = session_recording_requirements.class_session_id and (class_sessions.facilitator_id in (select id from public.facilitators where profile_id = auth.uid()) or public.current_facilitator_assigned_to_offering(class_sessions.cohort_course_id)))
);

create or replace function public.current_user_owns_recording_assignment(target_assignment_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.recording_learning_assignments assignment
    join public.course_enrollments on course_enrollments.id = assignment.course_enrollment_id
    join public.student_enrollments on student_enrollments.id = course_enrollments.student_enrollment_id
    join public.students on students.id = student_enrollments.student_id
    where assignment.id = target_assignment_id and students.profile_id = auth.uid()
  );
$$;

drop policy if exists "students and assigned facilitators read recording assignments" on public.recording_learning_assignments;
create policy "students and assigned facilitators read recording assignments" on public.recording_learning_assignments for select to authenticated using (
  public.current_user_owns_recording_assignment(id) or exists (select 1 from public.class_sessions where class_sessions.id = class_session_id and (class_sessions.facilitator_id in (select id from public.facilitators where profile_id = auth.uid()) or public.current_facilitator_assigned_to_offering(class_sessions.cohort_course_id)))
);

drop policy if exists "students and assigned facilitators read recording progress" on public.recording_progress;
create policy "students and assigned facilitators read recording progress" on public.recording_progress for select to authenticated using (public.current_user_owns_recording_assignment(recording_assignment_id) or exists (select 1 from public.recording_learning_assignments join public.class_sessions on class_sessions.id = recording_learning_assignments.class_session_id where recording_learning_assignments.id = recording_assignment_id and (class_sessions.facilitator_id in (select id from public.facilitators where profile_id = auth.uid()) or public.current_facilitator_assigned_to_offering(class_sessions.cohort_course_id))));

drop policy if exists "students read own playback evidence" on public.recording_playback_sessions;
create policy "students read own playback evidence" on public.recording_playback_sessions for select to authenticated using (public.current_user_owns_recording_assignment(recording_assignment_id));
drop policy if exists "students read own watch segments" on public.recording_watch_segments;
create policy "students read own watch segments" on public.recording_watch_segments for select to authenticated using (exists (select 1 from public.recording_playback_sessions where recording_playback_sessions.id = playback_session_id and public.current_user_owns_recording_assignment(recording_playback_sessions.recording_assignment_id)));

drop policy if exists "students read assigned checkpoints" on public.recording_checkpoints;
create policy "students read assigned checkpoints" on public.recording_checkpoints for select to authenticated using (exists (select 1 from public.recording_learning_assignments where recording_learning_assignments.class_recording_id = class_recording_id and public.current_user_owns_recording_assignment(recording_learning_assignments.id)));
drop policy if exists "students read assigned checkpoint questions" on public.recording_checkpoint_questions;
create policy "students read assigned checkpoint questions" on public.recording_checkpoint_questions for select to authenticated using (exists (select 1 from public.recording_checkpoints join public.recording_learning_assignments on recording_learning_assignments.class_recording_id = recording_checkpoints.class_recording_id where recording_checkpoints.id = checkpoint_id and public.current_user_owns_recording_assignment(recording_learning_assignments.id)));

drop policy if exists "students read own checkpoint attempts" on public.recording_checkpoint_attempts;
create policy "students read own checkpoint attempts" on public.recording_checkpoint_attempts for select to authenticated using (public.current_user_owns_recording_assignment(recording_assignment_id));
drop policy if exists "students and assigned facilitators read requirement status" on public.recording_requirement_statuses;
create policy "students and assigned facilitators read requirement status" on public.recording_requirement_statuses for select to authenticated using (public.current_user_owns_recording_assignment(recording_assignment_id) or exists (select 1 from public.recording_learning_assignments join public.class_sessions on class_sessions.id = recording_learning_assignments.class_session_id where recording_learning_assignments.id = recording_assignment_id and (class_sessions.facilitator_id in (select id from public.facilitators where profile_id = auth.uid()) or public.current_facilitator_assigned_to_offering(class_sessions.cohort_course_id))));

-- No authenticated policy is intentionally defined for recording_checkpoint_answer_keys.
-- Students and facilitators have no INSERT, UPDATE, or DELETE policy on any derived
-- progress, attempt, requirement, assignment, completion, or event-history table.
