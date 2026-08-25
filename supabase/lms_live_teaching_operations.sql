-- REALMS Institute: live teaching operations
-- Recording operations, recorded-route orchestration support, and the canonical
-- class-summary review/RLS boundary.
--
-- REVIEW AND APPLY MANUALLY. The application never executes this file.
-- Apply after the baseline LMS schema, Builds 6, 7, 8, and 9, and
-- lms_late_entry_catchup.sql.

begin;

-- ---------------------------------------------------------------------------
-- Recording-source metadata. Existing recordings remain valid.
-- ---------------------------------------------------------------------------

alter table public.class_recordings
  add column if not exists description text,
  add column if not exists recording_date date,
  add column if not exists admin_notes text,
  add column if not exists facilitator_notes text,
  add column if not exists source_submitted_by uuid references auth.users(id) on delete set null,
  add column if not exists source_submitted_at timestamptz;

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.class_recordings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%recording_status%'
  loop
    execute format('alter table public.class_recordings drop constraint %I', constraint_name);
  end loop;
end
$$;

-- Remove a legacy standalone one-session unique index too, if an older
-- environment created it without a named table constraint.
do $$
declare index_name text;
begin
  for index_name in
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'class_summaries'
      and indexdef ilike '%unique index%class_summaries% (class_session_id)'
      and indexname not in (
        select conindid::regclass::text
        from pg_constraint
        where conrelid = 'public.class_summaries'::regclass
          and conindid <> 0
      )
  loop
    execute format('drop index if exists public.%I', index_name);
  end loop;
end
$$;

alter table public.class_recordings
  add constraint class_recordings_recording_status_check
  check (recording_status in ('draft', 'processing', 'available', 'unavailable', 'archived')) not valid;
alter table public.class_recordings validate constraint class_recordings_recording_status_check;

create index if not exists class_recordings_operations_idx
  on public.class_recordings (recording_status, quality_checked, class_session_id);

-- ---------------------------------------------------------------------------
-- Class-summary review data. A session may have one published revision and one
-- open working revision. Older published revisions become superseded only when
-- a newly approved revision is published.
-- ---------------------------------------------------------------------------

alter table public.class_summaries
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text,
  add column if not exists review_decision text,
  add column if not exists review_note text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists published_by text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text,
  add column if not exists supersedes_summary_id uuid references public.class_summaries(id) on delete restrict,
  add column if not exists lock_version integer not null default 1;

update public.class_summaries
set published_by = coalesce(published_by, 'Historical publication')
where summary_status = 'published'
  and published_by is null;

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.class_summaries'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (class_session_id)'
  loop
    execute format('alter table public.class_summaries drop constraint %I', constraint_name);
  end loop;

  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.class_summaries'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%summary_status%'
  loop
    execute format('alter table public.class_summaries drop constraint %I', constraint_name);
  end loop;
end
$$;

alter table public.class_summaries
  add constraint class_summaries_status_check
  check (summary_status in ('draft', 'submitted', 'changes_requested', 'approved', 'published', 'archived', 'superseded')) not valid;
alter table public.class_summaries validate constraint class_summaries_status_check;

alter table public.class_summaries drop constraint if exists class_summaries_review_decision_check;
alter table public.class_summaries
  add constraint class_summaries_review_decision_check
  check (review_decision is null or review_decision in ('changes_requested', 'approved')) not valid;
alter table public.class_summaries validate constraint class_summaries_review_decision_check;

create unique index if not exists class_summaries_one_published_per_session_idx
  on public.class_summaries (class_session_id)
  where summary_status = 'published';

create unique index if not exists class_summaries_one_open_revision_per_session_idx
  on public.class_summaries (class_session_id)
  where summary_status in ('draft', 'submitted', 'changes_requested', 'approved');

create index if not exists class_summaries_review_queue_idx
  on public.class_summaries (summary_status, submitted_at, updated_at desc);

create table if not exists public.class_summary_review_events (
  id uuid primary key default gen_random_uuid(),
  class_summary_id uuid not null references public.class_summaries(id) on delete restrict,
  event_type text not null check (event_type in (
    'created', 'revised', 'submitted', 'changes_requested', 'approved',
    'published', 'archived', 'superseded', 'amendment_created'
  )),
  from_status text,
  to_status text not null,
  summary_version_number integer not null,
  note text,
  actor_type text not null check (actor_type in ('facilitator', 'admin', 'system')),
  actor_identifier text not null,
  created_at timestamptz not null default now()
);

create index if not exists class_summary_review_events_timeline_idx
  on public.class_summary_review_events (class_summary_id, created_at desc);

-- One canonical assignment predicate is reused by RLS and transactional RPCs.
create or replace function public.realms_facilitator_assigned_to_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_sessions session
    join public.facilitators facilitator
      on facilitator.profile_id = auth.uid()
    where session.id = target_session_id
      and facilitator.facilitator_status = 'active'
      and (
        session.facilitator_id = facilitator.id
        or exists (
          select 1
          from public.facilitator_course_assignments assignment
          where assignment.facilitator_id = facilitator.id
            and assignment.cohort_course_id = session.cohort_course_id
        )
      )
  );
$$;

revoke all on function public.realms_facilitator_assigned_to_session(uuid) from public;
grant execute on function public.realms_facilitator_assigned_to_session(uuid) to authenticated, service_role;

create or replace function public.save_class_summary_revision(
  p_class_session_id uuid,
  p_summary_id uuid,
  p_expected_version integer,
  p_content jsonb,
  p_change_note text,
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
  is_admin boolean := auth.role() = 'service_role';
  actor_id text;
  actor_uuid uuid;
  content_key text;
begin
  actor_id := case when is_admin
    then coalesce(nullif(trim(p_actor_identifier), ''), 'REALMS Admin')
    else auth.uid()::text
  end;
  actor_uuid := case
    when not is_admin then auth.uid()
    when coalesce(p_actor_identifier, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then p_actor_identifier::uuid
    else null
  end;
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception using errcode = '22023', message = 'Valid class-summary content is required.';
  end if;
  foreach content_key in array array[
    'learning_objectives', 'key_teaching_points', 'key_scriptures_references',
    'important_concepts', 'practical_applications', 'action_points',
    'recommended_resources'
  ] loop
    if jsonb_typeof(coalesce(p_content -> content_key, '[]'::jsonb)) <> 'array'
       or exists (
         select 1
         from jsonb_array_elements(coalesce(p_content -> content_key, '[]'::jsonb)) as element(value)
         where jsonb_typeof(element.value) <> 'string'
       ) then
      raise exception using errcode = '22023', message = 'Class-summary list fields must contain text items.';
    end if;
  end loop;
  if not is_admin and not public.realms_facilitator_assigned_to_session(p_class_session_id) then
    raise exception using errcode = '42501', message = 'You are not assigned to this class session.';
  end if;

  if p_summary_id is null then
    if exists (
      select 1 from public.class_summaries
      where class_session_id = p_class_session_id
        and summary_status in ('draft', 'submitted', 'changes_requested', 'approved')
    ) then
      raise exception using errcode = '23505', message = 'An open class-summary revision already exists.';
    end if;
    if exists (
      select 1 from public.class_summaries
      where class_session_id = p_class_session_id and summary_status = 'published'
    ) then
      raise exception using errcode = '22023', message = 'Create a controlled amendment from the published summary.';
    end if;

    insert into public.class_summaries (
      class_session_id, title, learning_objectives, key_teaching_points,
      key_scriptures_references, important_concepts, practical_applications,
      action_points, recommended_resources, additional_notes, summary_status,
      version_number, lock_version, created_by, updated_by
    ) values (
      p_class_session_id,
      nullif(trim(p_content ->> 'title'), ''),
      coalesce(p_content -> 'learning_objectives', '[]'::jsonb),
      coalesce(p_content -> 'key_teaching_points', '[]'::jsonb),
      coalesce(p_content -> 'key_scriptures_references', '[]'::jsonb),
      coalesce(p_content -> 'important_concepts', '[]'::jsonb),
      coalesce(p_content -> 'practical_applications', '[]'::jsonb),
      coalesce(p_content -> 'action_points', '[]'::jsonb),
      coalesce(p_content -> 'recommended_resources', '[]'::jsonb),
      nullif(trim(p_content ->> 'additional_notes'), ''),
      'draft', 1, 1, actor_uuid, actor_uuid
    ) returning * into saved_summary;

    insert into public.class_summary_review_events (
      class_summary_id, event_type, from_status, to_status,
      summary_version_number, note, actor_type, actor_identifier
    ) values (
      saved_summary.id, 'created', null, 'draft', 1, nullif(trim(p_change_note), ''),
      case when is_admin then 'admin' else 'facilitator' end, actor_id
    );
    return saved_summary;
  end if;

  select * into current_summary
  from public.class_summaries
  where id = p_summary_id and class_session_id = p_class_session_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Class summary not found.';
  end if;
  if current_summary.summary_status not in ('draft', 'changes_requested') then
    raise exception using errcode = '22023', message = 'Only a draft or changes-requested revision can be edited.';
  end if;
  if p_expected_version is null or current_summary.lock_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'This summary changed after it was opened. Reload before saving.';
  end if;

  insert into public.class_summary_versions (
    class_summary_id, version_number, snapshot, change_note, created_by
  ) values (
    current_summary.id,
    current_summary.version_number,
    to_jsonb(current_summary) - 'created_by' - 'updated_by',
    nullif(trim(p_change_note), ''),
    actor_uuid
  );

  update public.class_summaries
  set title = nullif(trim(p_content ->> 'title'), ''),
      learning_objectives = coalesce(p_content -> 'learning_objectives', '[]'::jsonb),
      key_teaching_points = coalesce(p_content -> 'key_teaching_points', '[]'::jsonb),
      key_scriptures_references = coalesce(p_content -> 'key_scriptures_references', '[]'::jsonb),
      important_concepts = coalesce(p_content -> 'important_concepts', '[]'::jsonb),
      practical_applications = coalesce(p_content -> 'practical_applications', '[]'::jsonb),
      action_points = coalesce(p_content -> 'action_points', '[]'::jsonb),
      recommended_resources = coalesce(p_content -> 'recommended_resources', '[]'::jsonb),
      additional_notes = nullif(trim(p_content ->> 'additional_notes'), ''),
      summary_status = case when summary_status = 'changes_requested' then 'draft' else summary_status end,
      review_decision = case when summary_status = 'changes_requested' then null else review_decision end,
      reviewed_at = case when summary_status = 'changes_requested' then null else reviewed_at end,
      reviewed_by = case when summary_status = 'changes_requested' then null else reviewed_by end,
      version_number = version_number + 1,
      lock_version = lock_version + 1,
      updated_by = actor_uuid,
      updated_at = now()
  where id = current_summary.id
  returning * into saved_summary;

  insert into public.class_summary_review_events (
    class_summary_id, event_type, from_status, to_status,
    summary_version_number, note, actor_type, actor_identifier
  ) values (
    saved_summary.id, 'revised', current_summary.summary_status, saved_summary.summary_status,
    saved_summary.version_number, nullif(trim(p_change_note), ''),
    case when is_admin then 'admin' else 'facilitator' end, actor_id
  );
  return saved_summary;
end;
$$;

revoke all on function public.save_class_summary_revision(uuid, uuid, integer, jsonb, text, text) from public;
grant execute on function public.save_class_summary_revision(uuid, uuid, integer, jsonb, text, text) to authenticated, service_role;

create or replace function public.transition_class_summary(
  p_summary_id uuid,
  p_action text,
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
  is_admin boolean := auth.role() = 'service_role';
  actor_id text;
  now_at timestamptz := now();
begin
  actor_id := case when is_admin
    then coalesce(nullif(trim(p_actor_identifier), ''), 'REALMS Admin')
    else auth.uid()::text
  end;
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

  if p_action = 'submit' then
    if is_admin or not public.realms_facilitator_assigned_to_session(current_summary.class_session_id) then
      raise exception using errcode = '42501', message = 'Only an assigned active facilitator can submit this summary.';
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
        updated_by = auth.uid(), updated_at = now_at
    where id = current_summary.id returning * into saved_summary;

  elsif p_action = 'request_changes' then
    if not is_admin then raise exception using errcode = '42501', message = 'Administrator access required.'; end if;
    if current_summary.summary_status <> 'submitted' then raise exception using errcode = '22023', message = 'Changes can be requested only from a submitted summary.'; end if;
    if nullif(trim(p_note), '') is null then raise exception using errcode = '22023', message = 'A review note is required.'; end if;
    update public.class_summaries
    set summary_status = 'changes_requested', reviewed_at = now_at, reviewed_by = actor_id,
        review_decision = 'changes_requested', review_note = trim(p_note),
        approved_at = null, approved_by = null, lock_version = lock_version + 1,
        updated_at = now_at
    where id = current_summary.id returning * into saved_summary;

  elsif p_action = 'approve' then
    if not is_admin then raise exception using errcode = '42501', message = 'Administrator access required.'; end if;
    if current_summary.summary_status <> 'submitted' then raise exception using errcode = '22023', message = 'Only a submitted summary can be approved.'; end if;
    update public.class_summaries
    set summary_status = 'approved', reviewed_at = now_at, reviewed_by = actor_id,
        review_decision = 'approved', review_note = nullif(trim(p_note), ''),
        approved_at = now_at, approved_by = actor_id, lock_version = lock_version + 1,
        updated_at = now_at
    where id = current_summary.id returning * into saved_summary;

  elsif p_action = 'publish' then
    if not is_admin then raise exception using errcode = '42501', message = 'Administrator access required.'; end if;
    if current_summary.summary_status <> 'approved' then raise exception using errcode = '22023', message = 'Only an approved summary can be published.'; end if;
    insert into public.class_summary_review_events (
      class_summary_id, event_type, from_status, to_status,
      summary_version_number, note, actor_type, actor_identifier
    )
    select id, 'superseded', 'published', 'superseded', version_number,
      'Superseded by approved revision ' || current_summary.id::text,
      'admin', actor_id
    from public.class_summaries
    where class_session_id = current_summary.class_session_id
      and id <> current_summary.id
      and summary_status = 'published';
    update public.class_summaries
    set summary_status = 'superseded', archived_at = now_at, archived_by = actor_id,
        lock_version = lock_version + 1, updated_at = now_at
    where class_session_id = current_summary.class_session_id
      and id <> current_summary.id
      and summary_status = 'published';
    update public.class_summaries
    set summary_status = 'published', published_at = now_at, published_by = actor_id,
        lock_version = lock_version + 1, updated_at = now_at
    where id = current_summary.id returning * into saved_summary;

  elsif p_action = 'archive' then
    if not is_admin then raise exception using errcode = '42501', message = 'Administrator access required.'; end if;
    if current_summary.summary_status <> 'published' then raise exception using errcode = '22023', message = 'Only a published summary can be archived.'; end if;
    if nullif(trim(p_note), '') is null then raise exception using errcode = '22023', message = 'An archive reason is required.'; end if;
    update public.class_summaries
    set summary_status = 'archived', archived_at = now_at, archived_by = actor_id,
        review_note = trim(p_note), lock_version = lock_version + 1, updated_at = now_at
    where id = current_summary.id returning * into saved_summary;

  elsif p_action = 'create_amendment' then
    if not is_admin then raise exception using errcode = '42501', message = 'Administrator access required.'; end if;
    if current_summary.summary_status <> 'published' then raise exception using errcode = '22023', message = 'Only a published summary can begin an amendment.'; end if;
    if nullif(trim(p_note), '') is null then raise exception using errcode = '22023', message = 'An amendment reason is required.'; end if;
    if exists (
      select 1 from public.class_summaries
      where class_session_id = current_summary.class_session_id
        and summary_status in ('draft', 'submitted', 'changes_requested', 'approved')
    ) then
      raise exception using errcode = '23505', message = 'An amendment is already in progress.';
    end if;
    insert into public.class_summaries (
      class_session_id, title, learning_objectives, key_teaching_points,
      key_scriptures_references, important_concepts, practical_applications,
      action_points, recommended_resources, additional_notes, summary_status,
      version_number, lock_version, supersedes_summary_id
    ) values (
      current_summary.class_session_id, current_summary.title,
      current_summary.learning_objectives, current_summary.key_teaching_points,
      current_summary.key_scriptures_references, current_summary.important_concepts,
      current_summary.practical_applications, current_summary.action_points,
      current_summary.recommended_resources, current_summary.additional_notes,
      'draft', 1, 1, current_summary.id
    ) returning * into saved_summary;
  else
    raise exception using errcode = '22023', message = 'Unsupported class-summary transition.';
  end if;

  insert into public.class_summary_review_events (
    class_summary_id, event_type, from_status, to_status,
    summary_version_number, note, actor_type, actor_identifier
  ) values (
    saved_summary.id,
    case
      when p_action = 'create_amendment' then 'amendment_created'
      when p_action = 'request_changes' then 'changes_requested'
      else p_action
    end,
    current_summary.summary_status,
    saved_summary.summary_status,
    saved_summary.version_number,
    nullif(trim(p_note), ''),
    case when is_admin then 'admin' else 'facilitator' end,
    actor_id
  );
  return saved_summary;
end;
$$;

revoke all on function public.transition_class_summary(uuid, text, integer, text, text) from public;
grant execute on function public.transition_class_summary(uuid, text, integer, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Canonical RLS. Direct writes are denied; the two RPCs above are the only
-- facilitator write boundary and preserve versions/transitions transactionally.
-- ---------------------------------------------------------------------------

alter table public.class_summaries enable row level security;
alter table public.class_summary_versions enable row level security;
alter table public.class_summary_review_events enable row level security;

revoke insert, update, delete on public.class_summaries from anon, authenticated;
revoke insert, update, delete on public.class_summary_versions from anon, authenticated;
revoke insert, update, delete on public.class_summary_review_events from anon, authenticated;
revoke select on public.class_summaries, public.class_summary_versions, public.class_summary_review_events from anon;
grant select on public.class_summaries, public.class_summary_versions, public.class_summary_review_events to authenticated;
grant all on public.class_summaries, public.class_summary_versions, public.class_summary_review_events to service_role;

do $$
declare policy_row record;
begin
  for policy_row in select policyname from pg_policies where schemaname = 'public' and tablename = 'class_summaries'
  loop execute format('drop policy if exists %I on public.class_summaries', policy_row.policyname); end loop;
  for policy_row in select policyname from pg_policies where schemaname = 'public' and tablename = 'class_summary_versions'
  loop execute format('drop policy if exists %I on public.class_summary_versions', policy_row.policyname); end loop;
  for policy_row in select policyname from pg_policies where schemaname = 'public' and tablename = 'class_summary_review_events'
  loop execute format('drop policy if exists %I on public.class_summary_review_events', policy_row.policyname); end loop;
end
$$;

create policy realms_class_summaries_read
  on public.class_summaries
  for select to authenticated
  using (
    public.realms_facilitator_assigned_to_session(class_session_id)
    or (
      summary_status = 'published'
      and exists (
        select 1
        from public.class_sessions session
        join public.course_enrollments course_enrollment
          on course_enrollment.cohort_course_id = session.cohort_course_id
        join public.student_enrollments student_enrollment
          on student_enrollment.id = course_enrollment.student_enrollment_id
        join public.students student
          on student.id = student_enrollment.student_id
        where session.id = class_summaries.class_session_id
          and session.visibility_status = 'enrolled_only'
          and student.profile_id = auth.uid()
          and course_enrollment.enrollment_status in ('active', 'enrolled')
      )
    )
  );

create policy realms_class_summary_versions_facilitator_read
  on public.class_summary_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.class_summaries summary
      where summary.id = class_summary_versions.class_summary_id
        and public.realms_facilitator_assigned_to_session(summary.class_session_id)
    )
  );

create policy realms_class_summary_review_events_facilitator_read
  on public.class_summary_review_events
  for select to authenticated
  using (
    exists (
      select 1 from public.class_summaries summary
      where summary.id = class_summary_review_events.class_summary_id
        and public.realms_facilitator_assigned_to_session(summary.class_session_id)
    )
  );

commit;
