-- REALMS programme-enrolment lifecycle reconciliation.
-- Apply after lms_build_1_security.sql.

create or replace function public.activate_programme_enrollment(
  p_student_enrollment_id uuid,
  p_reason text,
  p_actor_user_id uuid default null,
  p_actor_label text default 'REALMS Admin'
)
returns public.student_enrollments
language plpgsql
security definer
set search_path = public
as $$
declare
  current_enrollment public.student_enrollments;
  saved_enrollment public.student_enrollments;
  linked_student public.students;
  linked_cohort public.cohorts;
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Record the reason for activating the programme enrolment.';
  end if;

  select * into current_enrollment
  from public.student_enrollments
  where id = p_student_enrollment_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Programme enrolment not found.'; end if;

  if current_enrollment.enrolment_status = 'active' then return current_enrollment; end if;
  if current_enrollment.enrolment_status <> 'pending_onboarding' then
    raise exception using errcode = '22023', message = 'Only a pending-onboarding programme enrolment can be activated.';
  end if;

  select * into linked_student from public.students where id = current_enrollment.student_id for share;
  select * into linked_cohort from public.cohorts where id = current_enrollment.cohort_id for share;

  if linked_student.student_status <> 'active' or linked_student.onboarding_status <> 'completed' then
    raise exception using errcode = '22023', message = 'The student must be active with completed onboarding.';
  end if;
  if linked_cohort.status <> 'active' then
    raise exception using errcode = '22023', message = 'The linked cohort must be active.';
  end if;
  if current_enrollment.discipleship_route is null or current_enrollment.skill_pathway is null then
    raise exception using errcode = '22023', message = 'A discipleship route and skill pathway are required.';
  end if;
  if not exists (
    select 1 from public.course_enrollments
    where student_enrollment_id = current_enrollment.id
      and enrollment_status in ('active', 'enrolled')
  ) then
    raise exception using errcode = '22023', message = 'At least one active course enrolment is required.';
  end if;

  update public.student_enrollments
  set enrolment_status = 'active', updated_at = now()
  where id = current_enrollment.id and enrolment_status = 'pending_onboarding'
  returning * into saved_enrollment;
  if not found then raise exception using errcode = '40001', message = 'The programme enrolment changed. Reload and try again.'; end if;

  insert into public.audit_logs(action, entity_type, entity_id, actor_user_id, metadata)
  values ('programme_enrollment_activated', 'student_enrollment', current_enrollment.id, p_actor_user_id,
    jsonb_build_object(
      'previous_status', current_enrollment.enrolment_status,
      'new_status', saved_enrollment.enrolment_status,
      'reason', btrim(p_reason),
      'actor_identity', p_actor_label,
      'student_id', current_enrollment.student_id,
      'cohort_id', current_enrollment.cohort_id
    ));

  return saved_enrollment;
end;
$$;

revoke all on function public.activate_programme_enrollment(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.activate_programme_enrollment(uuid, text, uuid, text) to service_role;
