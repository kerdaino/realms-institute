-- Native recorded-learning checkpoint review metadata.
-- The existing nullable is_correct field remains the canonical decision:
-- null = awaiting human review, true = accepted, false = revision required.

alter table public.recording_checkpoint_attempts
  add column if not exists evaluated_at timestamptz,
  add column if not exists evaluated_by text,
  add column if not exists evaluator_note text;

comment on column public.recording_checkpoint_attempts.evaluated_at is 'When a staff reviewer decided this native checkpoint attempt.';
comment on column public.recording_checkpoint_attempts.evaluated_by is 'Reviewer identity using the existing REALMS actor reference convention.';
comment on column public.recording_checkpoint_attempts.evaluator_note is 'Optional acceptance feedback or required revision reason.';
