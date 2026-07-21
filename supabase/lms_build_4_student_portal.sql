-- REALMS Institute LMS / SIS Build 4
-- Apply after the Build 1 security migration and Build 3 session migration.
-- This narrows student course-catalogue visibility and permits only safe
-- personal profile changes. Normal portal reads remain authenticated and RLS-bound.

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
grant execute on function public.current_user_has_lms_role(text) to authenticated;
grant execute on function public.current_student_enrolled_in_offering(uuid) to authenticated;
grant execute on function public.current_student_enrolled_in_course(uuid) to authenticated;
grant execute on function public.current_facilitator_assigned_to_offering(uuid) to authenticated;
grant execute on function public.current_facilitator_assigned_to_course(uuid) to authenticated;

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

create or replace function public.guard_student_profile_self_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Administrative/service operations have no authenticated end-user uid and
  -- remain available to the existing protected administrative workflows.
  if auth.uid() is null then
    return new;
  end if;

  if auth.uid() <> old.id then
    raise exception 'Profile update is not permitted';
  end if;

  if (to_jsonb(new) - array['preferred_name', 'phone', 'avatar_url', 'updated_at'])
     is distinct from
     (to_jsonb(old) - array['preferred_name', 'phone', 'avatar_url', 'updated_at']) then
    raise exception 'Only safe personal profile fields may be updated';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists guard_student_profile_self_update on public.profiles;
create trigger guard_student_profile_self_update
before update on public.profiles
for each row
execute function public.guard_student_profile_self_update();

drop policy if exists "users update safe fields on own profile" on public.profiles;
create policy "users update safe fields on own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

