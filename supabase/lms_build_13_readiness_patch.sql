-- REALMS Institute LMS / SIS Build 13 readiness patch.
-- REVIEW AND APPLY MANUALLY. Do not rerun the historical Build 4, 5, or 7 files.
-- This patch is intentionally limited to the three gaps confirmed by Build 13.

begin;

-- Build 4: restore enrolled/assigned catalogue boundaries. The public website
-- uses its separate public programme catalogue; no anonymous LMS-table policy
-- is added here.
create or replace function public.current_user_has_lms_role(target_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    join public.roles on roles.id = user_roles.role_id
    where user_roles.user_id = auth.uid()
      and roles.name = target_role
  );
$$;

create or replace function public.current_student_enrolled_in_offering(target_offering_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.course_enrollments
    join public.student_enrollments on student_enrollments.id = course_enrollments.student_enrollment_id
    join public.students on students.id = student_enrollments.student_id
    where course_enrollments.cohort_course_id = target_offering_id
      and course_enrollments.enrollment_status in ('active', 'enrolled')
      and students.profile_id = auth.uid()
  );
$$;

create or replace function public.current_student_enrolled_in_course(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.course_enrollments
    join public.student_enrollments on student_enrollments.id = course_enrollments.student_enrollment_id
    join public.students on students.id = student_enrollments.student_id
    join public.cohort_courses on cohort_courses.id = course_enrollments.cohort_course_id
    where cohort_courses.course_id = target_course_id
      and course_enrollments.enrollment_status in ('active', 'enrolled')
      and students.profile_id = auth.uid()
  );
$$;

create or replace function public.current_facilitator_assigned_to_offering(target_offering_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.facilitator_course_assignments
    join public.facilitators on facilitators.id = facilitator_course_assignments.facilitator_id
    where facilitator_course_assignments.cohort_course_id = target_offering_id
      and facilitators.profile_id = auth.uid()
      and facilitators.active = true
  );
$$;

create or replace function public.current_facilitator_assigned_to_course(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.facilitator_course_assignments
    join public.facilitators on facilitators.id = facilitator_course_assignments.facilitator_id
    join public.cohort_courses on cohort_courses.id = facilitator_course_assignments.cohort_course_id
    where cohort_courses.course_id = target_course_id
      and facilitators.profile_id = auth.uid()
      and facilitators.active = true
  );
$$;

revoke all on function public.current_user_has_lms_role(text) from public;
revoke all on function public.current_student_enrolled_in_offering(uuid) from public;
revoke all on function public.current_student_enrolled_in_course(uuid) from public;
revoke all on function public.current_facilitator_assigned_to_offering(uuid) from public;
revoke all on function public.current_facilitator_assigned_to_course(uuid) from public;
revoke all on function public.current_user_has_lms_role(text) from anon;
revoke all on function public.current_student_enrolled_in_offering(uuid) from anon;
revoke all on function public.current_student_enrolled_in_course(uuid) from anon;
revoke all on function public.current_facilitator_assigned_to_offering(uuid) from anon;
revoke all on function public.current_facilitator_assigned_to_course(uuid) from anon;
grant execute on function public.current_user_has_lms_role(text) to authenticated;
grant execute on function public.current_student_enrolled_in_offering(uuid) to authenticated;
grant execute on function public.current_student_enrolled_in_course(uuid) to authenticated;
grant execute on function public.current_facilitator_assigned_to_offering(uuid) to authenticated;
grant execute on function public.current_facilitator_assigned_to_course(uuid) to authenticated;

alter table public.courses enable row level security;
alter table public.cohort_courses enable row level security;

drop policy if exists "authenticated users read course catalogue" on public.courses;
drop policy if exists "students read enrolled courses" on public.courses;
create policy "students read enrolled courses"
  on public.courses for select
  to authenticated
  using (
    public.current_user_has_lms_role('admin')
    or public.current_student_enrolled_in_course(id)
    or public.current_facilitator_assigned_to_course(id)
  );

drop policy if exists "authenticated users read cohort course catalogue" on public.cohort_courses;
drop policy if exists "students read enrolled cohort courses" on public.cohort_courses;
create policy "students read enrolled cohort courses"
  on public.cohort_courses for select
  to authenticated
  using (
    public.current_user_has_lms_role('admin')
    or public.current_student_enrolled_in_offering(id)
    or public.current_facilitator_assigned_to_offering(id)
  );

-- Build 5: one presentation-only RPC. It cannot return a facilitator unless
-- the caller is a student enrolled in that exact offering.
create or replace function public.get_student_course_facilitators(target_offering_ids uuid[])
returns table (
  cohort_course_id uuid,
  assignment_role text,
  display_name text,
  title text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    assignments.cohort_course_id,
    assignments.assignment_role,
    facilitators.display_name,
    facilitators.title
  from public.facilitator_course_assignments as assignments
  join public.facilitators on facilitators.id = assignments.facilitator_id
  where assignments.cohort_course_id = any(target_offering_ids)
    and facilitators.active = true
    and public.current_student_enrolled_in_offering(assignments.cohort_course_id)
  order by
    assignments.cohort_course_id,
    case assignments.assignment_role
      when 'lead' then 1
      when 'co_facilitator' then 2
      when 'assistant' then 3
      else 4
    end,
    facilitators.display_name;
$$;

revoke all on function public.get_student_course_facilitators(uuid[]) from public;
revoke all on function public.get_student_course_facilitators(uuid[]) from anon;
grant execute on function public.get_student_course_facilitators(uuid[]) to authenticated;

-- Build 7: nullable JSONB is deliberate. New application-created assignments
-- always write a complete snapshot; existing rows remain NULL/legacy rather
-- than receiving invented historical requirements.
alter table public.recording_learning_assignments
  add column if not exists requirement_snapshot jsonb;

commit;
