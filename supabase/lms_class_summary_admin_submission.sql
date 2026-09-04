-- Apply after lms_live_teaching_operations.sql.
-- This is intentionally not applied automatically. It gives service-role
-- administrators the same controlled draft-to-review entry point as faculty.

-- Deployed transition_class_summary versions may emit the legacy action-form
-- event name `submit`. Keep that audit event readable during rollout while all
-- newly defined functions below use the canonical past-tense `submitted` name.
alter table public.class_summary_review_events
  drop constraint if exists class_summary_review_events_event_type_check;
alter table public.class_summary_review_events
  add constraint class_summary_review_events_event_type_check check (event_type in (
    'created', 'revised', 'submit', 'submitted', 'changes_requested',
    'approve', 'approved', 'publish', 'published', 'archive', 'archived',
    'superseded', 'amendment_created'
  ));

create or replace function public.submit_admin_class_summary(
  p_summary_id uuid,
  p_expected_version integer,
  p_note text,
  p_actor_identifier text
)
returns public.class_summaries
language plpgsql
security definer
set search_path = public
as $$
declare
  current_summary public.class_summaries%rowtype;
  saved_summary public.class_summaries%rowtype;
  actor_id text;
  now_at timestamptz := now();
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'Administrator access required.';
  end if;
  actor_id := coalesce(nullif(trim(p_actor_identifier), ''), 'REALMS Admin');
  select * into current_summary
  from public.class_summaries
  where id = p_summary_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Class summary not found.';
  end if;
  if p_expected_version is null or current_summary.lock_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'This summary changed after it was opened. Reload before continuing.';
  end if;
  if current_summary.summary_status not in ('draft', 'changes_requested') then
    raise exception using errcode = '22023', message = 'Only a draft or revised summary can be submitted.';
  end if;
  if nullif(trim(current_summary.title), '') is null
     or jsonb_array_length(coalesce(current_summary.learning_objectives, '[]'::jsonb)) = 0
     or jsonb_array_length(coalesce(current_summary.key_teaching_points, '[]'::jsonb)) = 0 then
    raise exception using errcode = '22023', message = 'Add a title, learning objective, and key teaching point before submission.';
  end if;

  update public.class_summaries
  set summary_status = 'submitted', submitted_at = now_at, submitted_by = actor_id,
      review_decision = null, review_note = null, reviewed_at = null, reviewed_by = null,
      approved_at = null, approved_by = null, lock_version = lock_version + 1,
      updated_at = now_at
  where id = current_summary.id
  returning * into saved_summary;

  insert into public.class_summary_review_events (
    class_summary_id, event_type, from_status, to_status,
    summary_version_number, note, actor_type, actor_identifier
  ) values (
    saved_summary.id, 'submitted', current_summary.summary_status, saved_summary.summary_status,
    saved_summary.version_number, nullif(trim(p_note), ''), 'admin', actor_id
  );
  return saved_summary;
end;
$$;

revoke all on function public.submit_admin_class_summary(uuid, integer, text, text) from public;
grant execute on function public.submit_admin_class_summary(uuid, integer, text, text) to service_role;
