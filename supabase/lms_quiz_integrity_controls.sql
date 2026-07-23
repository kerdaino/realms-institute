-- REALMS quiz-integrity controls.
-- REVIEW ONLY: apply after lms_build_8_assessment_security.sql.
-- This migration does not publish quizzes, create questions, or change answer keys.

alter table public.quizzes
  add column if not exists answers_reviewable_at timestamptz,
  add column if not exists tab_monitoring_enabled boolean not null default true,
  add column if not exists tab_warning_threshold integer not null default 1,
  add column if not exists tab_flag_threshold integer not null default 3,
  add column if not exists tab_auto_submit_threshold integer,
  add column if not exists randomize_question_order boolean not null default false,
  add column if not exists randomize_option_order boolean not null default false;

alter table public.quiz_attempts
  add column if not exists auto_submitted_at timestamptz,
  add column if not exists expiry_finalized_at timestamptz,
  add column if not exists finalisation_reason text,
  add column if not exists question_order uuid[] not null default '{}'::uuid[],
  add column if not exists option_orders jsonb not null default '{}'::jsonb,
  add column if not exists tab_exit_count integer not null default 0,
  add column if not exists integrity_status text not null default 'clear',
  add column if not exists integrity_review_opened_at timestamptz,
  add column if not exists integrity_review_opened_by text,
  add column if not exists integrity_review_reason text,
  add column if not exists integrity_resolved_at timestamptz,
  add column if not exists integrity_resolved_by text,
  add column if not exists integrity_decision text,
  add column if not exists integrity_resolution_reason text,
  add column if not exists official_result_eligible boolean not null default true,
  add column if not exists replacement_for_attempt_id uuid references public.quiz_attempts(id) on delete restrict,
  add column if not exists replacement_status text not null default 'none',
  add column if not exists replacement_granted_at timestamptz,
  add column if not exists replacement_granted_by text,
  add column if not exists replacement_reason text;

update public.quiz_attempts
set integrity_status = 'under_review',
    integrity_review_opened_at = coalesce(integrity_review_opened_at, updated_at)
where attempt_status = 'under_integrity_review'
  and integrity_status = 'clear';

create table if not exists public.quiz_attempt_events (
  id uuid primary key default gen_random_uuid(),
  quiz_attempt_id uuid not null references public.quiz_attempts(id) on delete restrict,
  event_type text not null,
  event_key text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid,
  actor_label text,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_attempt_integrity_decisions (
  id uuid primary key default gen_random_uuid(),
  quiz_attempt_id uuid not null references public.quiz_attempts(id) on delete restrict,
  decision text not null,
  reason text not null,
  decided_by text not null,
  decided_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.quiz_attempt_replacement_grants (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete restrict,
  course_enrollment_id uuid not null references public.course_enrollments(id) on delete restrict,
  original_attempt_id uuid not null unique references public.quiz_attempts(id) on delete restrict,
  replacement_attempt_id uuid unique references public.quiz_attempts(id) on delete restrict,
  grant_status text not null default 'pending',
  reason text not null,
  granted_by text not null,
  granted_at timestamptz not null default now(),
  consumed_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.prevent_quiz_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Quiz audit records are immutable.';
end;
$$;

drop trigger if exists quiz_attempt_events_immutable on public.quiz_attempt_events;
create trigger quiz_attempt_events_immutable
before update or delete on public.quiz_attempt_events
for each row execute function public.prevent_quiz_audit_mutation();

drop trigger if exists quiz_attempt_integrity_decisions_immutable on public.quiz_attempt_integrity_decisions;
create trigger quiz_attempt_integrity_decisions_immutable
before update or delete on public.quiz_attempt_integrity_decisions
for each row execute function public.prevent_quiz_audit_mutation();

do $$ begin
  alter table public.quizzes add constraint quizzes_answer_review_time_check check (
    answers_reviewable_at is null or closes_at is null or answers_reviewable_at >= closes_at
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.quizzes add constraint quizzes_tab_policy_check check (
    tab_warning_threshold >= 1
    and tab_flag_threshold >= tab_warning_threshold
    and (tab_auto_submit_threshold is null or tab_auto_submit_threshold >= tab_flag_threshold)
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.quiz_attempts add constraint quiz_attempt_integrity_status_check check (
    integrity_status in ('clear', 'under_review', 'resolved', 'confirmed_misconduct')
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.quiz_attempts add constraint quiz_attempt_integrity_decision_check check (
    integrity_decision is null or integrity_decision in ('cleared', 'warning_recorded', 'attempt_voided', 'replacement_granted', 'confirmed_misconduct')
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.quiz_attempts add constraint quiz_attempt_replacement_status_check check (
    replacement_status in ('none', 'granted', 'replacement')
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.quiz_attempt_events add constraint quiz_attempt_event_type_check check (
    event_type in (
      'visibility_hidden', 'visibility_returned', 'integrity_review_opened',
      'integrity_review_resolved', 'expired_auto_submitted',
      'visibility_policy_auto_submitted', 'replacement_granted',
      'replacement_attempt_started'
    )
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.quiz_attempt_integrity_decisions add constraint quiz_integrity_decision_check check (
    decision in ('cleared', 'warning_recorded', 'attempt_voided', 'replacement_granted', 'confirmed_misconduct')
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.quiz_attempt_replacement_grants add constraint quiz_replacement_grant_status_check check (
    grant_status in ('pending', 'consumed', 'cancelled')
  );
exception when duplicate_object then null; end $$;

create unique index if not exists quiz_attempt_one_active_idx
  on public.quiz_attempts(quiz_id, course_enrollment_id)
  where attempt_status = 'in_progress';
create unique index if not exists quiz_attempt_replacement_for_unique_idx
  on public.quiz_attempts(replacement_for_attempt_id)
  where replacement_for_attempt_id is not null;
drop index if exists public.quiz_attempt_event_key_unique_idx;
create unique index quiz_attempt_event_key_unique_idx
  on public.quiz_attempt_events(quiz_attempt_id, event_key);
create index if not exists quiz_attempt_events_attempt_time_idx
  on public.quiz_attempt_events(quiz_attempt_id, occurred_at);
create index if not exists quiz_attempts_expiry_idx
  on public.quiz_attempts(expires_at)
  where attempt_status = 'in_progress' and expires_at is not null;
create index if not exists quiz_replacement_grant_pending_idx
  on public.quiz_attempt_replacement_grants(quiz_id, course_enrollment_id, grant_status);

alter table public.quiz_attempt_events enable row level security;
alter table public.quiz_attempt_integrity_decisions enable row level security;
alter table public.quiz_attempt_replacement_grants enable row level security;

revoke all on public.quiz_attempt_events, public.quiz_attempt_integrity_decisions, public.quiz_attempt_replacement_grants from anon, authenticated;

create or replace function public.current_user_has_active_quiz_attempt(target_quiz_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.quiz_attempts qa
    join public.quizzes q on q.id = qa.quiz_id
    join public.course_enrollments ce on ce.id = qa.course_enrollment_id
    where qa.quiz_id = target_quiz_id
      and qa.attempt_status = 'in_progress'
      and qa.started_at <= now()
      and (qa.expires_at is null or qa.expires_at > now())
      and ce.enrollment_status in ('active', 'enrolled')
      and q.quiz_status = 'published'
      and (q.opens_at is null or q.opens_at <= now())
      and (q.closes_at is null or q.closes_at > now())
      and public.is_own_student_enrollment(ce.student_enrollment_id)
  );
$$;

revoke all on function public.current_user_has_active_quiz_attempt(uuid) from public;
grant execute on function public.current_user_has_active_quiz_attempt(uuid) to authenticated, service_role;

drop policy if exists "students and assigned facilitators read quiz questions" on public.quiz_questions;
create policy "students and assigned facilitators read quiz questions"
on public.quiz_questions
for select
to authenticated
using (
  public.current_user_has_active_quiz_attempt(quiz_id)
  or exists (
    select 1
    from public.quizzes
    where quizzes.id = quiz_questions.quiz_id
      and public.current_facilitator_assigned_to_offering(quizzes.cohort_course_id)
  )
);

-- Answer keys remain server-only. This migration intentionally creates no
-- authenticated SELECT policy and grants no authenticated DML on answer keys.
revoke select on public.quiz_answer_keys from anon, authenticated;

create or replace function public.grant_quiz_replacement_attempt(
  p_attempt_id uuid,
  p_reason text,
  p_actor text
)
returns setof public.quiz_attempt_replacement_grants
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.quiz_attempts%rowtype;
  existing public.quiz_attempt_replacement_grants%rowtype;
  saved public.quiz_attempt_replacement_grants%rowtype;
begin
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'A documented replacement reason is required.';
  end if;
  if length(trim(coalesce(p_actor, ''))) < 2 then
    raise exception 'An administrative actor is required.';
  end if;

  select * into target from public.quiz_attempts where id = p_attempt_id for update;
  if target.id is null then raise exception 'Quiz attempt not found.'; end if;
  if target.replacement_for_attempt_id is not null then
    raise exception 'A replacement attempt cannot receive another replacement.';
  end if;

  select * into existing
  from public.quiz_attempt_replacement_grants
  where original_attempt_id = p_attempt_id;
  if existing.id is not null then
    return next existing;
    return;
  end if;

  insert into public.quiz_attempt_replacement_grants (
    quiz_id, course_enrollment_id, original_attempt_id, reason, granted_by
  ) values (
    target.quiz_id, target.course_enrollment_id, target.id, trim(p_reason), trim(p_actor)
  ) returning * into saved;

  update public.quiz_attempts
  set attempt_status = 'voided_for_replacement',
      submitted_at = coalesce(submitted_at, now()),
      finalisation_reason = 'replacement_granted',
      official_result_eligible = false,
      replacement_status = 'granted',
      replacement_granted_at = now(),
      replacement_granted_by = trim(p_actor),
      replacement_reason = trim(p_reason),
      integrity_status = case when integrity_status = 'under_review' then 'resolved' else integrity_status end,
      integrity_resolved_at = case when integrity_status = 'under_review' then now() else integrity_resolved_at end,
      integrity_resolved_by = case when integrity_status = 'under_review' then trim(p_actor) else integrity_resolved_by end,
      integrity_decision = 'replacement_granted',
      integrity_resolution_reason = trim(p_reason),
      updated_at = now()
  where id = target.id;

  update public.recording_requirement_statuses rrs
  set requirement_status = 'pending',
      evidence_source = null,
      evidence_reference = null,
      completed_at = null,
      verified_at = null,
      verified_by = null,
      verification_note = 'Prior quiz evidence was voided when a replacement attempt was granted.',
      updated_at = now()
  from public.recording_learning_assignments rla,
       public.session_recording_requirements srr
  where rrs.recording_assignment_id = rla.id
    and rla.class_session_id = srr.class_session_id
    and rla.course_enrollment_id = target.course_enrollment_id
    and srr.quiz_id = target.quiz_id
    and rrs.evidence_source = 'quiz_attempt'
    and rrs.evidence_reference = target.id::text;

  insert into public.quiz_attempt_integrity_decisions (
    quiz_attempt_id, decision, reason, decided_by
  ) values (
    target.id, 'replacement_granted', trim(p_reason), trim(p_actor)
  );

  insert into public.quiz_attempt_events (
    quiz_attempt_id, event_type, event_key, metadata, actor_label
  ) values (
    target.id,
    'replacement_granted',
    'replacement-granted',
    jsonb_build_object('replacement_grant_id', saved.id),
    trim(p_actor)
  ) on conflict (quiz_attempt_id, event_key) do nothing;

  return next saved;
end;
$$;

create or replace function public.resolve_quiz_attempt_integrity(
  p_attempt_id uuid,
  p_decision text,
  p_reason text,
  p_actor text
)
returns setof public.quiz_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.quiz_attempts%rowtype;
  next_status text;
begin
  if p_decision not in ('cleared', 'warning_recorded', 'attempt_voided', 'confirmed_misconduct') then
    raise exception 'Choose a supported integrity decision.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'A documented integrity-review reason is required.';
  end if;
  if length(trim(coalesce(p_actor, ''))) < 2 then
    raise exception 'An administrative actor is required.';
  end if;

  select * into target from public.quiz_attempts where id = p_attempt_id for update;
  if target.id is null then raise exception 'Quiz attempt not found.'; end if;
  if target.integrity_status <> 'under_review' then
    if target.integrity_decision = p_decision then
      return next target;
      return;
    end if;
    raise exception 'This attempt is not under integrity review.';
  end if;

  next_status := case
    when p_decision in ('attempt_voided', 'confirmed_misconduct') then 'administratively_invalidated'
    when target.attempt_status = 'under_integrity_review' and target.graded_at is not null then 'graded'
    when target.attempt_status = 'under_integrity_review' and target.submitted_at is not null then 'awaiting_review'
    else target.attempt_status
  end;

  update public.quiz_attempts
  set attempt_status = next_status,
      integrity_status = case when p_decision = 'confirmed_misconduct' then 'confirmed_misconduct' else 'resolved' end,
      integrity_resolved_at = now(),
      integrity_resolved_by = trim(p_actor),
      integrity_decision = p_decision,
      integrity_resolution_reason = trim(p_reason),
      official_result_eligible = case when p_decision in ('attempt_voided', 'confirmed_misconduct') then false else official_result_eligible end,
      finalisation_reason = case when p_decision in ('attempt_voided', 'confirmed_misconduct') then p_decision else finalisation_reason end,
      updated_at = now()
  where id = target.id
  returning * into target;

  if p_decision in ('attempt_voided', 'confirmed_misconduct') then
    update public.recording_requirement_statuses rrs
    set requirement_status = 'pending',
        evidence_source = null,
        evidence_reference = null,
        completed_at = null,
        verified_at = null,
        verified_by = null,
        verification_note = 'Prior quiz evidence was invalidated through authorised integrity review.',
        updated_at = now()
    from public.recording_learning_assignments rla,
         public.session_recording_requirements srr
    where rrs.recording_assignment_id = rla.id
      and rla.class_session_id = srr.class_session_id
      and rla.course_enrollment_id = target.course_enrollment_id
      and srr.quiz_id = target.quiz_id
      and rrs.evidence_source = 'quiz_attempt'
      and rrs.evidence_reference = target.id::text;
  end if;

  insert into public.quiz_attempt_integrity_decisions (
    quiz_attempt_id, decision, reason, decided_by
  ) values (
    target.id, p_decision, trim(p_reason), trim(p_actor)
  );

  insert into public.quiz_attempt_events (
    quiz_attempt_id, event_type, event_key, metadata, actor_label
  ) values (
    target.id,
    'integrity_review_resolved',
    'integrity-resolution-' || p_decision,
    jsonb_build_object('decision', p_decision),
    trim(p_actor)
  ) on conflict (quiz_attempt_id, event_key) do nothing;

  return next target;
end;
$$;

revoke all on function public.grant_quiz_replacement_attempt(uuid, text, text) from public;
revoke all on function public.resolve_quiz_attempt_integrity(uuid, text, text, text) from public;
grant execute on function public.grant_quiz_replacement_attempt(uuid, text, text) to service_role;
grant execute on function public.resolve_quiz_attempt_integrity(uuid, text, text, text) to service_role;

-- All new table writes remain service-role owned through authenticated server
-- routes. No student or facilitator can grant replacements or resolve reviews.
