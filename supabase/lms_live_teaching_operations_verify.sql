-- Read-only verification after lms_live_teaching_operations.sql is applied.
-- Run in the Supabase SQL editor before deploying application code.

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('class_recordings', 'class_summaries', 'class_summary_review_events')
  and column_name in (
    'description', 'recording_date', 'admin_notes', 'facilitator_notes',
    'submitted_at', 'reviewed_at', 'review_decision', 'approved_at',
    'published_by', 'supersedes_summary_id', 'lock_version'
  )
order by table_name, ordinal_position;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'realms_facilitator_assigned_to_session',
    'save_class_summary_revision',
    'transition_class_summary'
  )
order by routine_name;

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('class_summaries', 'class_summary_versions', 'class_summary_review_events')
order by tablename, policyname;

-- Must return zero rows: only one open and one published revision may exist.
select class_session_id, count(*)
from public.class_summaries
where summary_status in ('draft', 'submitted', 'changes_requested', 'approved')
group by class_session_id
having count(*) > 1;

select class_session_id, count(*)
from public.class_summaries
where summary_status = 'published'
group by class_session_id
having count(*) > 1;

-- Operational recording exceptions. These are reports, not mutations.
select recording_status, quality_checked, count(*)
from public.class_recordings
group by recording_status, quality_checked
order by recording_status, quality_checked;

select attendance.class_session_id, attendance.course_enrollment_id,
       attendance.attendance_status
from public.session_attendance attendance
where attendance.attendance_status = 'pending_recorded_verification'
  and not exists (
    select 1
    from public.recording_learning_assignments assignment
    join public.class_recordings recording on recording.id = assignment.class_recording_id
    where assignment.class_session_id = attendance.class_session_id
      and assignment.course_enrollment_id = attendance.course_enrollment_id
      and assignment.purpose_code in ('RP', 'DR-E')
      and recording.recording_status = 'available'
      and recording.quality_checked = true
  );

select makeup.id, makeup.class_session_id, makeup.course_enrollment_id, makeup.makeup_status
from public.makeup_requirements makeup
where makeup.purpose_code = 'MU-E'
  and makeup.makeup_status in ('awaiting_materials', 'alternative_required')
  and makeup.recording_learning_assignment_id is null;

-- Must return zero rows: the reused purpose-aware key is the idempotency guard.
select course_enrollment_id, class_recording_id, purpose_code, count(*)
from public.recording_learning_assignments
group by course_enrollment_id, class_recording_id, purpose_code
having count(*) > 1;

-- Must return zero rows: recorded-route assignments cannot pre-date the
-- student's actual course-enrolment period.
select assignment.id, assignment.purpose_code, assignment.class_session_id,
       enrollment.enrolled_at, session.scheduled_end_at
from public.recording_learning_assignments assignment
join public.course_enrollments enrollment on enrollment.id = assignment.course_enrollment_id
join public.class_sessions session on session.id = assignment.class_session_id
where assignment.purpose_code in ('RP', 'DR-E')
  and enrollment.enrolled_at is not null
  and coalesce(session.scheduled_end_at, session.scheduled_start_at) < enrollment.enrolled_at;

-- Review deliberately; any rows show an evidence-bearing assignment whose
-- recording is no longer at the strong quality gate. Completed historical
-- evidence remains preserved and must not be rewritten automatically.
select assignment.id, assignment.purpose_code, assignment.assignment_status,
       recording.recording_status, recording.quality_checked
from public.recording_learning_assignments assignment
join public.class_recordings recording on recording.id = assignment.class_recording_id
where assignment.purpose_code <> 'REV'
  and (
    recording.recording_status <> 'available'
    or recording.access_level <> 'enrolled_students'
    or recording.quality_checked is distinct from true
    or recording.recording_date is null
    or coalesce(nullif(trim(recording.title), ''), '') = ''
    or (
      coalesce(nullif(trim(recording.external_url), ''), '') = ''
      and coalesce(nullif(trim(recording.embed_url), ''), '') = ''
    )
  );

-- Must return zero rows before official activation. Enabled evidence mechanisms
-- need valid linked records, and required checkpoint counts must be positive.
select requirement.id, requirement.class_session_id,
       requirement.requires_checkpoints, requirement.required_checkpoint_count,
       requirement.requires_quiz, requirement.quiz_id,
       requirement.requires_practical, requirement.practical_assignment_id,
       requirement.requires_reflection, requirement.reflection_assignment_id
from public.session_recording_requirements requirement
where requirement.requirement_status = 'active'
  and (
    (requirement.requires_checkpoints and coalesce(requirement.required_checkpoint_count, 0) <= 0)
    or (requirement.requires_quiz and requirement.quiz_id is null)
    or (requirement.requires_practical and requirement.practical_assignment_id is null)
    or (requirement.requires_reflection and requirement.reflection_assignment_id is null)
  );

-- Review any quality-approved recording whose active session override requires
-- more usable checkpoints than exist. A usable required checkpoint has at least
-- one active question; this prevents students being assigned impossible work.
select recording.id as class_recording_id,
       recording.class_session_id,
       requirement.required_checkpoint_count,
       count(distinct checkpoint.id) filter (
         where checkpoint.is_active = true
           and checkpoint.is_required = true
           and question.id is not null
       ) as usable_required_checkpoints
from public.class_recordings recording
join public.session_recording_requirements requirement
  on requirement.class_session_id = recording.class_session_id
 and requirement.requirement_status = 'active'
left join public.recording_checkpoints checkpoint
  on checkpoint.class_recording_id = recording.id
left join public.recording_checkpoint_questions question
  on question.checkpoint_id = checkpoint.id
 and question.is_active = true
where recording.recording_status = 'available'
  and recording.quality_checked = true
  and requirement.requires_checkpoints = true
group by recording.id, recording.class_session_id, requirement.required_checkpoint_count
having count(distinct checkpoint.id) filter (
         where checkpoint.is_active = true
           and checkpoint.is_required = true
           and question.id is not null
       ) < coalesce(requirement.required_checkpoint_count, 0);

-- Review deliberately: an approved recording make-up must remain separate
-- from the original excused-absence attendance evidence.
select makeup.id, makeup.makeup_status, attendance.attendance_status,
       assignment.assignment_status
from public.makeup_requirements makeup
join public.recording_learning_assignments assignment
  on assignment.id = makeup.recording_learning_assignment_id
left join public.session_attendance attendance
  on attendance.id = makeup.session_attendance_id
where makeup.purpose_code = 'MU-E'
  and makeup.makeup_status in ('completed', 'late_complete')
  and attendance.attendance_status is distinct from 'excused_absence';

-- RLS fixture procedure (run only in controlled staging):
-- 1. Choose a non-empty assigned active facilitator/session fixture and an unrelated
--    facilitator/session fixture.
-- 2. SET LOCAL ROLE authenticated and set request.jwt.claim.sub to each profile UUID.
-- 3. Call save_class_summary_revision for the assigned fixture (must succeed), then
--    repeat for the unrelated and inactive fixtures (must fail with 42501).
-- 4. Submit the assigned draft (must succeed); attempt approve/publish as the
--    facilitator (must fail with 42501).
-- 5. Use the service role to request changes, approve, and publish in valid order.
-- 6. Query as an enrolled student (published only) and unrelated student (zero rows).
-- 7. Wrap fixture creation and all calls in BEGIN/ROLLBACK; do not use live cohort rows.
