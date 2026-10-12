-- REALMS assignment administration: reversible close and audited deadline extension.
-- Apply after lms_build_8_assessment_security.sql.

alter table public.assignments
  add column if not exists lock_version integer not null default 1;

do $$ begin
  alter table public.assignments
    add constraint assignments_lock_version_check check (lock_version > 0);
exception when duplicate_object then null;
end $$;

create or replace function public.extend_assignment_deadline(
  p_assignment_id uuid,
  p_new_deadline timestamptz,
  p_reason text,
  p_expected_version integer,
  p_actor_user_id uuid default null,
  p_actor_label text default 'REALMS Admin'
)
returns public.assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  current_assignment public.assignments;
  saved_assignment public.assignments;
begin
  if p_new_deadline is null then raise exception using errcode = '22023', message = 'Enter a valid new assignment deadline.'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception using errcode = '22023', message = 'Record the reason for extending the assignment deadline.'; end if;

  select * into current_assignment from public.assignments where id = p_assignment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Assignment not found.'; end if;
  if current_assignment.lock_version <> p_expected_version then raise exception using errcode = '40001', message = 'This assignment changed after you loaded it. Reload the page and try again.'; end if;
  if current_assignment.assignment_status = 'archived' then raise exception using errcode = '22023', message = 'An archived assignment deadline cannot be extended.'; end if;
  if current_assignment.due_at is not null and p_new_deadline <= current_assignment.due_at then raise exception using errcode = '22023', message = 'The new deadline must be later than the current deadline.'; end if;

  update public.assignments
  set due_at = p_new_deadline,
      updated_by = p_actor_user_id,
      updated_at = now(),
      lock_version = lock_version + 1
  where id = p_assignment_id
  returning * into saved_assignment;

  insert into public.audit_logs(action, entity_type, entity_id, actor_user_id, metadata)
  values ('assignment_deadline_extended', 'assignment', p_assignment_id, p_actor_user_id,
    jsonb_build_object('previous_deadline', current_assignment.due_at, 'new_deadline', saved_assignment.due_at,
      'previous_state', current_assignment.assignment_status, 'resulting_state', saved_assignment.assignment_status,
      'reason', btrim(p_reason), 'actor_identity', p_actor_label, 'previous_lock_version', current_assignment.lock_version,
      'resulting_lock_version', saved_assignment.lock_version));
  return saved_assignment;
end;
$$;

create or replace function public.close_assignment(
  p_assignment_id uuid,
  p_reason text,
  p_expected_version integer,
  p_actor_user_id uuid default null,
  p_actor_label text default 'REALMS Admin'
)
returns public.assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  current_assignment public.assignments;
  saved_assignment public.assignments;
begin
  if nullif(btrim(p_reason), '') is null then raise exception using errcode = '22023', message = 'Record the reason for closing the assignment.'; end if;
  select * into current_assignment from public.assignments where id = p_assignment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Assignment not found.'; end if;
  if current_assignment.lock_version <> p_expected_version then raise exception using errcode = '40001', message = 'This assignment changed after you loaded it. Reload the page and try again.'; end if;
  if current_assignment.assignment_status <> 'published' then raise exception using errcode = '22023', message = 'Only a published assignment can be closed.'; end if;

  update public.assignments
  set assignment_status = 'closed', updated_by = p_actor_user_id, updated_at = now(), lock_version = lock_version + 1
  where id = p_assignment_id returning * into saved_assignment;

  insert into public.audit_logs(action, entity_type, entity_id, actor_user_id, metadata)
  values ('assignment_closed', 'assignment', p_assignment_id, p_actor_user_id,
    jsonb_build_object('previous_state', current_assignment.assignment_status, 'resulting_state', saved_assignment.assignment_status,
      'previous_deadline', current_assignment.due_at, 'reason', btrim(p_reason), 'actor_identity', p_actor_label,
      'previous_lock_version', current_assignment.lock_version, 'resulting_lock_version', saved_assignment.lock_version));
  return saved_assignment;
end;
$$;

create or replace function public.reopen_assignment(
  p_assignment_id uuid,
  p_new_deadline timestamptz,
  p_reason text,
  p_expected_version integer,
  p_actor_user_id uuid default null,
  p_actor_label text default 'REALMS Admin'
)
returns public.assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  current_assignment public.assignments;
  saved_assignment public.assignments;
  resulting_deadline timestamptz;
begin
  if nullif(btrim(p_reason), '') is null then raise exception using errcode = '22023', message = 'Record the reason for reopening the assignment.'; end if;
  select * into current_assignment from public.assignments where id = p_assignment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Assignment not found.'; end if;
  if current_assignment.lock_version <> p_expected_version then raise exception using errcode = '40001', message = 'This assignment changed after you loaded it. Reload the page and try again.'; end if;
  if current_assignment.assignment_status <> 'closed' then raise exception using errcode = '22023', message = 'Only a closed assignment can be reopened.'; end if;

  resulting_deadline := coalesce(p_new_deadline, current_assignment.due_at);
  if current_assignment.due_at is not null and current_assignment.due_at <= now() and p_new_deadline is null then
    raise exception using errcode = '22023', message = 'Choose a new future deadline before reopening this expired assignment.';
  end if;
  if p_new_deadline is not null and p_new_deadline <= now() then
    raise exception using errcode = '22023', message = 'The new reopening deadline must be in the future.';
  end if;

  update public.assignments
  set assignment_status = 'published', due_at = resulting_deadline, updated_by = p_actor_user_id,
      updated_at = now(), lock_version = lock_version + 1
  where id = p_assignment_id returning * into saved_assignment;

  insert into public.audit_logs(action, entity_type, entity_id, actor_user_id, metadata)
  values ('assignment_reopened', 'assignment', p_assignment_id, p_actor_user_id,
    jsonb_build_object('previous_state', current_assignment.assignment_status, 'resulting_state', saved_assignment.assignment_status,
      'previous_deadline', current_assignment.due_at, 'new_deadline', case when p_new_deadline is null then null else saved_assignment.due_at end,
      'reason', btrim(p_reason), 'actor_identity', p_actor_label, 'previous_lock_version', current_assignment.lock_version,
      'resulting_lock_version', saved_assignment.lock_version));
  return saved_assignment;
end;
$$;

revoke all on function public.extend_assignment_deadline(uuid, timestamptz, text, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.close_assignment(uuid, text, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.reopen_assignment(uuid, timestamptz, text, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.extend_assignment_deadline(uuid, timestamptz, text, integer, uuid, text) to service_role;
grant execute on function public.close_assignment(uuid, text, integer, uuid, text) to service_role;
grant execute on function public.reopen_assignment(uuid, timestamptz, text, integer, uuid, text) to service_role;
