-- Apply after lms_build_7_recorded_learning.sql.
-- This is intentionally not applied automatically. All guidance remains
-- optional so existing checkpoint questions retain their current behaviour.

alter table public.recording_checkpoint_questions
  add column if not exists response_format text,
  add column if not exists min_characters integer,
  add column if not exists max_characters integer,
  add column if not exists min_words integer,
  add column if not exists max_words integer;

alter table public.recording_checkpoint_questions
  drop constraint if exists recording_checkpoint_questions_response_format_check,
  drop constraint if exists recording_checkpoint_questions_min_characters_check,
  drop constraint if exists recording_checkpoint_questions_max_characters_check,
  drop constraint if exists recording_checkpoint_questions_min_words_check,
  drop constraint if exists recording_checkpoint_questions_max_words_check,
  drop constraint if exists recording_checkpoint_questions_character_range_check,
  drop constraint if exists recording_checkpoint_questions_word_range_check;

alter table public.recording_checkpoint_questions
  add constraint recording_checkpoint_questions_response_format_check check (response_format is null or response_format in ('short_text', 'long_text')) not valid,
  add constraint recording_checkpoint_questions_min_characters_check check (min_characters is null or min_characters >= 1) not valid,
  add constraint recording_checkpoint_questions_max_characters_check check (max_characters is null or max_characters >= 1) not valid,
  add constraint recording_checkpoint_questions_min_words_check check (min_words is null or min_words >= 1) not valid,
  add constraint recording_checkpoint_questions_max_words_check check (max_words is null or max_words >= 1) not valid,
  add constraint recording_checkpoint_questions_character_range_check check (min_characters is null or max_characters is null or min_characters <= max_characters) not valid,
  add constraint recording_checkpoint_questions_word_range_check check (min_words is null or max_words is null or min_words <= max_words) not valid;

alter table public.recording_checkpoint_questions validate constraint recording_checkpoint_questions_response_format_check;
alter table public.recording_checkpoint_questions validate constraint recording_checkpoint_questions_min_characters_check;
alter table public.recording_checkpoint_questions validate constraint recording_checkpoint_questions_max_characters_check;
alter table public.recording_checkpoint_questions validate constraint recording_checkpoint_questions_min_words_check;
alter table public.recording_checkpoint_questions validate constraint recording_checkpoint_questions_max_words_check;
alter table public.recording_checkpoint_questions validate constraint recording_checkpoint_questions_character_range_check;
alter table public.recording_checkpoint_questions validate constraint recording_checkpoint_questions_word_range_check;
