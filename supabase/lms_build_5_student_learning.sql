-- REALMS Institute LMS / SIS Build 5
-- Apply after lms_build_4_student_portal.sql.
-- Returns only facilitator presentation fields for a student's enrolled
-- offerings. It does not open the underlying facilitator or assignment rows.

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
grant execute on function public.get_student_course_facilitators(uuid[]) to authenticated;

