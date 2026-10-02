-- Atomic native checkpoint submission lifecycle.
-- Legacy rows retain null review_cycle until the separately reviewed cleanup is run.

alter table public.recording_checkpoint_attempts
  add column if not exists review_cycle integer check (review_cycle is null or review_cycle > 0);

create unique index if not exists checkpoint_attempt_review_cycle_unique
  on public.recording_checkpoint_attempts(recording_assignment_id, question_id, review_cycle)
  where review_cycle is not null;

create unique index if not exists checkpoint_attempt_number_unique_for_managed_rows
  on public.recording_checkpoint_attempts(recording_assignment_id, question_id, attempt_number)
  where review_cycle is not null;

create or replace function public.submit_recording_checkpoint_attempt(
  p_recording_assignment_id uuid,
  p_checkpoint_id uuid,
  p_question_id uuid,
  p_submitted_answer jsonb,
  p_is_correct boolean,
  p_evaluated_by text default null
)
returns table (
  id uuid,
  recording_assignment_id uuid,
  checkpoint_id uuid,
  question_id uuid,
  submitted_answer jsonb,
  is_correct boolean,
  attempt_number integer,
  review_cycle integer,
  answered_at timestamptz,
  evaluated_at timestamptz,
  evaluated_by text,
  evaluator_note text,
  inserted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.recording_checkpoint_attempts%rowtype;
  next_attempt integer;
  next_cycle integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_recording_assignment_id::text || ':' || p_question_id::text, 0));

  select attempt.* into existing
  from public.recording_checkpoint_attempts attempt
  where attempt.recording_assignment_id = p_recording_assignment_id
    and attempt.question_id = p_question_id
    and (attempt.is_correct is null or attempt.is_correct is true)
  order by (attempt.is_correct is true) desc, attempt.answered_at desc, attempt.created_at desc, attempt.id desc
  limit 1;

  if found then
    return query select existing.id, existing.recording_assignment_id, existing.checkpoint_id, existing.question_id,
      existing.submitted_answer, existing.is_correct, existing.attempt_number, existing.review_cycle,
      existing.answered_at, existing.evaluated_at, existing.evaluated_by, existing.evaluator_note, false;
    return;
  end if;

  select coalesce(max(attempt.attempt_number), 0) + 1,
         coalesce(max(coalesce(attempt.review_cycle, attempt.attempt_number)), 0) + 1
    into next_attempt, next_cycle
  from public.recording_checkpoint_attempts attempt
  where attempt.recording_assignment_id = p_recording_assignment_id
    and attempt.question_id = p_question_id;

  insert into public.recording_checkpoint_attempts (
    recording_assignment_id, checkpoint_id, question_id, submitted_answer, is_correct,
    attempt_number, review_cycle, evaluated_at, evaluated_by
  ) values (
    p_recording_assignment_id, p_checkpoint_id, p_question_id, p_submitted_answer, p_is_correct,
    next_attempt, next_cycle, case when p_is_correct is null then null else now() end,
    case when p_is_correct is null then null else coalesce(nullif(btrim(p_evaluated_by), ''), 'System') end
  )
  returning recording_checkpoint_attempts.* into existing;

  return query select existing.id, existing.recording_assignment_id, existing.checkpoint_id, existing.question_id,
    existing.submitted_answer, existing.is_correct, existing.attempt_number, existing.review_cycle,
    existing.answered_at, existing.evaluated_at, existing.evaluated_by, existing.evaluator_note, true;
end;
$$;

revoke all on function public.submit_recording_checkpoint_attempt(uuid, uuid, uuid, jsonb, boolean, text) from public, anon, authenticated;
grant execute on function public.submit_recording_checkpoint_attempt(uuid, uuid, uuid, jsonb, boolean, text) to service_role;

comment on function public.submit_recording_checkpoint_attempt(uuid, uuid, uuid, jsonb, boolean, text) is
  'Serializes one active native checkpoint submission per assignment/question review cycle and returns an existing pending or accepted attempt idempotently.';

create or replace function public.cleanup_accidental_checkpoint_attempt_burst(
  p_keep_id uuid,
  p_remove_ids uuid[],
  p_actor text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  kept public.recording_checkpoint_attempts%rowtype;
  removable_count integer;
begin
  if coalesce(array_length(p_remove_ids, 1), 0) = 0 or p_keep_id = any(p_remove_ids) then
    raise exception 'A distinct canonical attempt and duplicate ids are required.';
  end if;

  select * into kept from public.recording_checkpoint_attempts where id = p_keep_id for update;
  if not found or kept.is_correct is not null or kept.evaluated_at is not null or kept.evaluated_by is not null or kept.evaluator_note is not null then
    raise exception 'The canonical attempt is not an untouched pending-review submission.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(kept.recording_assignment_id::text || ':' || kept.question_id::text, 0));

  select count(*) into removable_count
  from public.recording_checkpoint_attempts attempt
  where attempt.id = any(p_remove_ids)
    and attempt.recording_assignment_id = kept.recording_assignment_id
    and attempt.checkpoint_id = kept.checkpoint_id
    and attempt.question_id = kept.question_id
    and attempt.submitted_answer = kept.submitted_answer
    and attempt.is_correct is null
    and attempt.evaluated_at is null
    and attempt.evaluated_by is null
    and attempt.evaluator_note is null
    and abs(extract(epoch from attempt.answered_at - kept.answered_at)) <= 10;

  if removable_count <> array_length(p_remove_ids, 1) then
    raise exception 'One or more proposed duplicates failed the safety checks.';
  end if;

  delete from public.recording_checkpoint_attempts where id = any(p_remove_ids);
  insert into public.audit_logs(action, entity_type, entity_id, actor_user_id, metadata)
  values ('recording_checkpoint_attempts_deduplicated', 'recording_learning_assignment', kept.recording_assignment_id, null,
    jsonb_build_object('kept_attempt_id', kept.id, 'removed_attempt_ids', to_jsonb(p_remove_ids), 'checkpoint_id', kept.checkpoint_id, 'question_id', kept.question_id, 'removed_count', removable_count, 'actor', p_actor));
  return removable_count;
end;
$$;

revoke all on function public.cleanup_accidental_checkpoint_attempt_burst(uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.cleanup_accidental_checkpoint_attempt_burst(uuid, uuid[], text) to service_role;
