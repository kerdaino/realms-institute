-- REALMS late-entry catch-up extension.
-- Review and apply manually after Build 6 attendance, Build 7 recorded learning,
-- Build 9 absence/make-up security, and the August 2026 operational migration.
-- No student, attendance, catch-up, or session data is changed by this migration.

alter table public.recording_learning_assignments
  drop constraint if exists recording_learning_assignments_purpose_code_check;
alter table public.recording_learning_assignments
  add constraint recording_learning_assignments_purpose_code_check
  check (purpose_code in ('REV','RP','DR-E','MU-E','MU-U','LE-C')) not valid;
alter table public.recording_learning_assignments
  validate constraint recording_learning_assignments_purpose_code_check;

alter table public.makeup_requirements drop constraint if exists makeup_purpose_check;
alter table public.makeup_requirements
  add constraint makeup_purpose_check check (purpose_code in ('MU-E','MU-U','LE-C')) not valid;
alter table public.makeup_requirements validate constraint makeup_purpose_check;

alter table public.makeup_requirements drop constraint if exists makeup_status_check;
alter table public.makeup_requirements
  add constraint makeup_status_check check (makeup_status in (
    'awaiting_materials','alternative_required','assigned','not_started','in_progress',
    'awaiting_checkpoint','awaiting_quiz','awaiting_practical','awaiting_reflection',
    'awaiting_oral_verification','under_review','completed','late_complete','overdue',
    'incomplete','waived','cancelled','integrity_review'
  )) not valid;
alter table public.makeup_requirements validate constraint makeup_status_check;

alter table public.class_sessions
  add column if not exists live_access_note text;

create index if not exists makeup_requirement_late_entry_overview_idx
  on public.makeup_requirements (course_enrollment_id, due_at, makeup_status)
  where purpose_code = 'LE-C';

-- Existing RLS remains authoritative. Catch-up mutations continue through
-- authenticated server routes and the existing service-role boundary.
