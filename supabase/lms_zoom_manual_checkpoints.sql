-- Apply after lms_build_7_recorded_learning.sql.
-- This is intentionally not applied automatically.
-- Playback positions remain supported, but Zoom manual-verification checkpoints
-- may rely only on explicit checkpoint_order and therefore store both as null.

alter table public.recording_checkpoints
  drop constraint if exists recording_checkpoints_check;
alter table public.recording_checkpoints
  drop constraint if exists recording_checkpoints_position_check;

alter table public.recording_checkpoints
  add constraint recording_checkpoints_position_check
  check (
    (position_seconds is not null)::integer
      + (position_percentage is not null)::integer <= 1
  ) not valid;

alter table public.recording_checkpoints
  validate constraint recording_checkpoints_position_check;
