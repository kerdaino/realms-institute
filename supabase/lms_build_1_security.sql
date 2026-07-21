-- REALMS Institute LMS / SIS Build 1
-- Apply after the migration that creates the LMS tables and seed data.
-- This file adds the uniqueness guarantees used by idempotent provisioning
-- and the least-privilege read policies used by the Build 1 portal shells.

create unique index if not exists roles_name_unique_idx
  on public.roles (name);

create unique index if not exists profiles_email_unique_idx
  on public.profiles (lower(email))
  where email is not null;

create unique index if not exists user_roles_user_role_unique_idx
  on public.user_roles (user_id, role_id);

create unique index if not exists students_profile_unique_idx
  on public.students (profile_id)
  where profile_id is not null;

create unique index if not exists students_registration_unique_idx
  on public.students (registration_id)
  where registration_id is not null;

create unique index if not exists cohorts_code_unique_idx
  on public.cohorts (code);

create unique index if not exists courses_code_unique_idx
  on public.courses (code);

create unique index if not exists cohort_courses_cohort_course_unique_idx
  on public.cohort_courses (cohort_id, course_id);

create unique index if not exists student_enrollments_student_cohort_unique_idx
  on public.student_enrollments (student_id, cohort_id);

create unique index if not exists course_enrollments_student_course_unique_idx
  on public.course_enrollments (student_enrollment_id, cohort_course_id);

create unique index if not exists alumni_student_unique_idx
  on public.alumni (student_id);

create unique index if not exists facilitators_profile_unique_idx
  on public.facilitators (profile_id)
  where profile_id is not null;

create unique index if not exists facilitator_course_assignment_unique_idx
  on public.facilitator_course_assignments (facilitator_id, cohort_course_id, assignment_role);

alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.students enable row level security;
alter table public.alumni enable row level security;
alter table public.cohorts enable row level security;
alter table public.courses enable row level security;
alter table public.cohort_courses enable row level security;
alter table public.student_enrollments enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.facilitators enable row level security;
alter table public.facilitator_course_assignments enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "authenticated users read role catalogue" on public.roles;
create policy "authenticated users read role catalogue"
  on public.roles for select
  to authenticated
  using (true);

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "users read own roles" on public.user_roles;
create policy "users read own roles"
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "students read own master record" on public.students;
create policy "students read own master record"
  on public.students for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "students read own cohort enrolments" on public.student_enrollments;
create policy "students read own cohort enrolments"
  on public.student_enrollments for select
  to authenticated
  using (
    exists (
      select 1
      from public.students
      where students.id = student_enrollments.student_id
        and students.profile_id = auth.uid()
    )
  );

drop policy if exists "students read own course enrolments" on public.course_enrollments;
create policy "students read own course enrolments"
  on public.course_enrollments for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_enrollments
      join public.students on students.id = student_enrollments.student_id
      where student_enrollments.id = course_enrollments.student_enrollment_id
        and students.profile_id = auth.uid()
    )
  );

drop policy if exists "authenticated users read cohorts" on public.cohorts;
create policy "authenticated users read cohorts"
  on public.cohorts for select
  to authenticated
  using (true);

drop policy if exists "authenticated users read course catalogue" on public.courses;
create policy "authenticated users read course catalogue"
  on public.courses for select
  to authenticated
  using (true);

drop policy if exists "authenticated users read cohort course catalogue" on public.cohort_courses;
create policy "authenticated users read cohort course catalogue"
  on public.cohort_courses for select
  to authenticated
  using (true);

drop policy if exists "alumni read own alumni record" on public.alumni;
create policy "alumni read own alumni record"
  on public.alumni for select
  to authenticated
  using (
    exists (
      select 1
      from public.students
      where students.id = alumni.student_id
        and students.profile_id = auth.uid()
    )
  );

drop policy if exists "facilitators read own master record" on public.facilitators;
create policy "facilitators read own master record"
  on public.facilitators for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "facilitators read own course assignments" on public.facilitator_course_assignments;
create policy "facilitators read own course assignments"
  on public.facilitator_course_assignments for select
  to authenticated
  using (
    exists (
      select 1
      from public.facilitators
      where facilitators.id = facilitator_course_assignments.facilitator_id
        and facilitators.profile_id = auth.uid()
    )
  );

-- No authenticated-user policy is created for audit_logs. Provisioning writes
-- through the server-only service-role client after the existing admin gate.
