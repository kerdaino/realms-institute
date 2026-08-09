-- Controlled application removal for REALMS admissions.
-- Review and apply manually. Do not run this file through the application.

alter table public.registrations
  add column if not exists cohort_code text not null default 'RSD-AUG-2026',
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists deletion_reason text,
  add column if not exists deletion_note text,
  add column if not exists superseded_by_application_id uuid;

alter table public.registrations
  drop constraint if exists registrations_deletion_reason_check,
  drop constraint if exists registrations_deleted_state_check,
  drop constraint if exists registrations_superseded_by_application_fk,
  drop constraint if exists registrations_not_self_superseded_check;

alter table public.registrations
  add constraint registrations_deletion_reason_check check (
    deletion_reason is null or deletion_reason in (
      'duplicate_application',
      'applicant_restarted_application',
      'test_application',
      'submitted_in_error',
      'applicant_requested_removal',
      'administrative_cleanup',
      'other'
    )
  ),
  add constraint registrations_deleted_state_check check (
    (deleted_at is null and deleted_by is null and deletion_reason is null and deletion_note is null and superseded_by_application_id is null)
    or (
      deleted_at is not null
      and deleted_by is not null
      and deletion_reason is not null
      and (deletion_reason <> 'other' or nullif(btrim(coalesce(deletion_note, '')), '') is not null)
      and (superseded_by_application_id is null or deletion_reason in ('duplicate_application', 'applicant_restarted_application'))
    )
  ),
  add constraint registrations_superseded_by_application_fk
    foreign key (superseded_by_application_id) references public.registrations(id) on delete restrict,
  add constraint registrations_not_self_superseded_check
    check (superseded_by_application_id is null or superseded_by_application_id <> id);

-- Review and communication audit history must make a physical delete fail rather
-- than disappear through the legacy cascade.
alter table public.registration_review_events
  drop constraint if exists registration_review_events_registration_id_fkey;
alter table public.registration_review_events
  add constraint registration_review_events_registration_id_fkey
  foreign key (registration_id) references public.registrations(id) on delete restrict;

create index if not exists registrations_active_admissions_idx
  on public.registrations (cohort_code, created_at desc)
  where deleted_at is null;

create index if not exists registrations_deleted_at_idx
  on public.registrations (deleted_at desc)
  where deleted_at is not null;

create index if not exists registrations_active_normalized_email_idx
  on public.registrations (cohort_code, lower(btrim(email)))
  where deleted_at is null;

create or replace function public.prevent_duplicate_active_registration()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.cohort_code || ':' || lower(btrim(new.email)), 0));
  if exists (
    select 1
    from public.registrations existing
    where existing.id <> new.id
      and existing.deleted_at is null
      and existing.cohort_code = new.cohort_code
      and lower(btrim(existing.email)) = lower(btrim(new.email))
  ) then
    raise exception using
      errcode = '23505',
      message = 'ACTIVE_APPLICATION_ALREADY_EXISTS',
      constraint = 'registrations_active_cohort_email_guard';
  end if;
  return new;
end;
$$;

drop trigger if exists registrations_prevent_duplicate_active on public.registrations;
create trigger registrations_prevent_duplicate_active
before insert or update of email, cohort_code, deleted_at on public.registrations
for each row execute function public.prevent_duplicate_active_registration();

create or replace function public.soft_delete_registration(
  target_registration_id uuid,
  deletion_actor text,
  deletion_reason_value text,
  deletion_note_value text default null,
  superseding_registration_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.registrations%rowtype;
  survivor public.registrations%rowtype;
  removed_at timestamptz := now();
begin
  if nullif(btrim(deletion_actor), '') is null then
    raise exception 'A deletion actor is required.';
  end if;
  if deletion_reason_value not in (
    'duplicate_application', 'applicant_restarted_application', 'test_application',
    'submitted_in_error', 'applicant_requested_removal', 'administrative_cleanup', 'other'
  ) then
    raise exception 'A valid deletion reason is required.';
  end if;
  if deletion_reason_value = 'other' and nullif(btrim(coalesce(deletion_note_value, '')), '') is null then
    raise exception 'A deletion note is required for Other.';
  end if;
  if superseding_registration_id is not null
    and deletion_reason_value not in ('duplicate_application', 'applicant_restarted_application') then
    raise exception 'A superseding application is only valid for duplicate or restarted applications.';
  end if;

  select * into target from public.registrations where id = target_registration_id for update;
  if not found then raise exception 'Application not found.'; end if;
  if target.deleted_at is not null then raise exception 'Application is already deleted.'; end if;

  if superseding_registration_id is not null then
    if superseding_registration_id = target_registration_id then raise exception 'An application cannot supersede itself.'; end if;
    select * into survivor from public.registrations where id = superseding_registration_id for update;
    if not found or survivor.deleted_at is not null then raise exception 'The application to keep must be active.'; end if;
    if survivor.cohort_code <> target.cohort_code or lower(btrim(survivor.email)) <> lower(btrim(target.email)) then
      raise exception 'The application to keep must use the same applicant email and cohort.';
    end if;
  end if;

  update public.registrations
  set deleted_at = removed_at,
      deleted_by = btrim(deletion_actor),
      deletion_reason = deletion_reason_value,
      deletion_note = nullif(btrim(coalesce(deletion_note_value, '')), ''),
      superseded_by_application_id = superseding_registration_id
  where id = target_registration_id;

  insert into public.registration_review_events
    (registration_id, event_type, previous_state, new_state, note, actor, created_at)
  values (
    target_registration_id,
    'application_deleted',
    jsonb_build_object('deleted_at', null),
    jsonb_build_object(
      'deleted_at', removed_at,
      'applicant_name', target.full_name,
      'applicant_email', target.email,
      'cohort_code', target.cohort_code,
      'deletion_reason', deletion_reason_value,
      'superseded_by_application_id', superseding_registration_id
    ),
    nullif(btrim(coalesce(deletion_note_value, '')), ''),
    btrim(deletion_actor),
    removed_at
  );
end;
$$;

create or replace function public.restore_registration(
  target_registration_id uuid,
  restoration_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.registrations%rowtype;
  restored_at timestamptz := now();
begin
  if nullif(btrim(restoration_actor), '') is null then raise exception 'A restoration actor is required.'; end if;
  select * into target from public.registrations where id = target_registration_id for update;
  if not found then raise exception 'Application not found.'; end if;
  if target.deleted_at is null then raise exception 'Application is already active.'; end if;

  update public.registrations
  set deleted_at = null,
      deleted_by = null,
      deletion_reason = null,
      deletion_note = null,
      superseded_by_application_id = null
  where id = target_registration_id;

  insert into public.registration_review_events
    (registration_id, event_type, previous_state, new_state, note, actor, created_at)
  values (
    target_registration_id,
    'application_restored',
    jsonb_build_object(
      'deleted_at', target.deleted_at,
      'deletion_reason', target.deletion_reason,
      'deletion_note', target.deletion_note,
      'superseded_by_application_id', target.superseded_by_application_id
    ),
    jsonb_build_object('deleted_at', null),
    'Application restored to active admissions operations. No email or decision was repeated.',
    btrim(restoration_actor),
    restored_at
  );
end;
$$;

revoke all on function public.soft_delete_registration(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.restore_registration(uuid, text) from public, anon, authenticated;
grant execute on function public.soft_delete_registration(uuid, text, text, text, uuid) to service_role;
grant execute on function public.restore_registration(uuid, text) to service_role;
