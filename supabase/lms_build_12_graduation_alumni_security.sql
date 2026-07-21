-- REALMS Institute LMS / SIS Build 12 security extension.
-- Apply after the separately prepared corrected Build 12 schema.
-- This file does not create duplicate Build 12 tables or alumni columns.

create or replace function public.is_own_alumni(p_alumni_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.alumni a
    join public.students s on s.id = a.student_id
    where a.id = p_alumni_id and s.profile_id = auth.uid()
  );
$$;

create or replace function public.is_own_alumni_programme_record(p_programme_record_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.alumni_programme_records apr
    where apr.id = p_programme_record_id and public.is_own_alumni(apr.alumni_id)
  );
$$;

revoke all on function public.is_own_alumni(uuid) from public;
revoke all on function public.is_own_alumni_programme_record(uuid) from public;
grant execute on function public.is_own_alumni(uuid) to authenticated, service_role;
grant execute on function public.is_own_alumni_programme_record(uuid) to authenticated, service_role;

alter table public.graduation_confirmations enable row level security;
alter table public.graduation_confirmation_events enable row level security;
alter table public.alumni_programme_records enable row level security;
alter table public.certificate_templates enable row level security;
alter table public.institutional_awards enable row level security;
alter table public.award_issuance_events enable row level security;
alter table public.award_verification_events enable row level security;
alter table public.alumni_conversion_events enable row level security;
alter table public.alumni_course_archives enable row level security;
alter table public.alumni_summary_archive_items enable row level security;
alter table public.alumni_recording_access_grants enable row level security;
alter table public.alumni_announcements enable row level security;
alter table public.alumni_announcement_reads enable row level security;
alter table public.alumni_outcome_updates enable row level security;

drop policy if exists "alumni read own person record" on public.alumni;
create policy "alumni read own person record" on public.alumni for select to authenticated using (public.is_own_alumni(id));

drop policy if exists "alumni read own programme records" on public.alumni_programme_records;
create policy "alumni read own programme records" on public.alumni_programme_records for select to authenticated using (public.is_own_alumni_programme_record(id));

drop policy if exists "alumni read own course archives" on public.alumni_course_archives;
create policy "alumni read own course archives" on public.alumni_course_archives for select to authenticated using (public.is_own_alumni_programme_record(alumni_programme_record_id));

drop policy if exists "alumni read own active summary archive" on public.alumni_summary_archive_items;
create policy "alumni read own active summary archive" on public.alumni_summary_archive_items for select to authenticated using (
  archive_status = 'active' and exists (
    select 1 from public.alumni_course_archives aca
    where aca.id = alumni_course_archive_id and public.is_own_alumni_programme_record(aca.alumni_programme_record_id)
  )
);

drop policy if exists "alumni read own recording grants" on public.alumni_recording_access_grants;
create policy "alumni read own recording grants" on public.alumni_recording_access_grants for select to authenticated using (
  access_status = 'active'
  and (available_from is null or available_from <= now())
  and (available_until is null or available_until > now())
  and exists (
    select 1 from public.alumni_course_archives aca
    where aca.id = alumni_course_archive_id and public.is_own_alumni_programme_record(aca.alumni_programme_record_id)
  )
);

drop policy if exists "alumni read granted recordings" on public.class_recordings;
create policy "alumni read granted recordings" on public.class_recordings for select to authenticated using (
  recording_status = 'available' and retention_status = 'active'
  and (available_from is null or available_from <= now()) and (available_until is null or available_until > now())
  and exists (
    select 1 from public.alumni_recording_access_grants arag
    join public.alumni_course_archives aca on aca.id = arag.alumni_course_archive_id
    where arag.class_recording_id = class_recordings.id
      and arag.access_status = 'active'
      and (arag.available_from is null or arag.available_from <= now())
      and (arag.available_until is null or arag.available_until > now())
      and public.is_own_alumni_programme_record(aca.alumni_programme_record_id)
  )
);

drop policy if exists "alumni read own issued awards" on public.institutional_awards;
create policy "alumni read own issued awards" on public.institutional_awards for select to authenticated using (
  public.is_own_alumni_programme_record(alumni_programme_record_id)
);

drop policy if exists "alumni read targeted announcements" on public.alumni_announcements;
create policy "alumni read targeted announcements" on public.alumni_announcements for select to authenticated using (
  announcement_status = 'published' and published_at <= now() and (expires_at is null or expires_at > now())
  and (
    target_scope = 'all_alumni'
    or exists (
      select 1 from public.alumni_programme_records apr
      join public.alumni a on a.id = apr.alumni_id
      where public.is_own_alumni(a.id) and (
        (target_scope = 'cohort' and (target_value = apr.cohort_id::text or lower(target_value) = lower(apr.cohort_name_snapshot)))
        or (target_scope = 'discipleship_route' and lower(target_value) = lower(apr.discipleship_route))
        or (target_scope = 'skill_pathway' and lower(target_value) = lower(apr.skill_pathway))
      )
    )
  )
);

drop policy if exists "alumni read own announcement reads" on public.alumni_announcement_reads;
create policy "alumni read own announcement reads" on public.alumni_announcement_reads for select to authenticated using (public.is_own_alumni(alumni_id));
drop policy if exists "alumni create own announcement reads" on public.alumni_announcement_reads;
create policy "alumni create own announcement reads" on public.alumni_announcement_reads for insert to authenticated with check (public.is_own_alumni(alumni_id));
drop policy if exists "alumni update own announcement reads" on public.alumni_announcement_reads;
create policy "alumni update own announcement reads" on public.alumni_announcement_reads for update to authenticated using (public.is_own_alumni(alumni_id)) with check (public.is_own_alumni(alumni_id));

drop policy if exists "alumni read own outcome updates" on public.alumni_outcome_updates;
create policy "alumni read own outcome updates" on public.alumni_outcome_updates for select to authenticated using (public.is_own_alumni(alumni_id));
drop policy if exists "alumni submit own outcome updates" on public.alumni_outcome_updates;
create policy "alumni submit own outcome updates" on public.alumni_outcome_updates for insert to authenticated with check (public.is_own_alumni(alumni_id) and outcome_status = 'submitted');

-- There is intentionally no anonymous policy on institutional_awards.
revoke all on public.graduation_confirmations, public.graduation_confirmation_events, public.certificate_templates, public.award_issuance_events, public.award_verification_events, public.alumni_conversion_events from anon, authenticated;
revoke all on public.alumni_programme_records, public.institutional_awards, public.alumni_course_archives, public.alumni_summary_archive_items, public.alumni_recording_access_grants, public.alumni_announcements, public.alumni_announcement_reads, public.alumni_outcome_updates from anon, authenticated;

grant select on public.alumni_programme_records, public.alumni_course_archives, public.alumni_summary_archive_items, public.alumni_announcements to authenticated;
grant select (id, alumni_programme_record_id, graduation_confirmation_id, student_enrollment_id, certificate_template_id, award_number, verification_code, award_type, award_title, awarding_institution, programme_name, recipient_legal_name, cohort_name_snapshot, discipleship_route, skill_pathway, award_status, document_status, issued_at, supersedes_award_id, superseded_at, revoked_at, created_at, updated_at) on public.institutional_awards to authenticated;
grant select (id, alumni_course_archive_id, class_recording_id, access_status, available_from, available_until, granted_at, created_at, updated_at) on public.alumni_recording_access_grants to authenticated;
grant select, insert, update on public.alumni_announcement_reads to authenticated;
grant select (id, alumni_id, outcome_type, role_or_activity, organisation_or_ministry, location_summary, outcome_summary, update_date, may_contact_for_followup, testimony_use_consent, testimony_consent_recorded_at, outcome_status, created_at, updated_at) on public.alumni_outcome_updates to authenticated;
grant insert (alumni_id, outcome_type, role_or_activity, organisation_or_ministry, location_summary, outcome_summary, update_date, may_contact_for_followup, testimony_use_consent, testimony_consent_recorded_at, outcome_status) on public.alumni_outcome_updates to authenticated;

create or replace function public.get_own_alumni_archive_resources()
returns table (id uuid, class_session_id uuid, title text, description text, resource_type text, external_url text, file_name text, mime_type text, access_level text, is_active boolean)
language sql stable security definer set search_path = public as $$
  select sr.id, sr.class_session_id, sr.title, sr.description, sr.resource_type, sr.external_url, sr.file_name, sr.mime_type, sr.access_level, sr.is_active
  from public.session_resources sr
  join public.class_sessions cs on cs.id = sr.class_session_id
  join public.alumni_course_archives aca on aca.cohort_course_id = cs.cohort_course_id and aca.archive_status = 'active'
  where sr.is_active = true and sr.access_level = 'alumni_archive'
    and public.is_own_alumni_programme_record(aca.alumni_programme_record_id);
$$;
revoke all on function public.get_own_alumni_archive_resources() from public;
grant execute on function public.get_own_alumni_archive_resources() to authenticated;

-- All Build 12 administrative writes remain service-role owned after the
-- password-protected admin route reauthorises the request server-side.
