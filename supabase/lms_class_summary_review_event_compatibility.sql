-- Apply after lms_live_teaching_operations.sql.
-- This is intentionally not applied automatically. It aligns the constrained
-- audit vocabulary with every event currently emitted by the transition RPC,
-- while retaining historical past-tense and legacy submission values.

begin;

alter table public.class_summary_review_events
  drop constraint if exists class_summary_review_events_event_type_check;

alter table public.class_summary_review_events
  add constraint class_summary_review_events_event_type_check
  check (event_type in (
    'created', 'revised',
    'submit', 'submitted',
    'changes_requested',
    'approve', 'approved',
    'publish', 'published',
    'archive', 'archived',
    'superseded', 'amendment_created'
  )) not valid;

alter table public.class_summary_review_events
  validate constraint class_summary_review_events_event_type_check;

commit;
