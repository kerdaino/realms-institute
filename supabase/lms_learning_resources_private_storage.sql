-- REALMS LMS: private learning-resource storage and metadata.
-- REVIEW AND APPLY SEPARATELY. This file is not executed by the application.
-- Facilitator/admin writes and all signed downloads remain server-authorised.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'learning-resources',
  'learning-resources',
  false,
  4194304,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.session_resources
  add column if not exists size_bytes bigint,
  add column if not exists sha256 text,
  add column if not exists uploaded_by uuid,
  add column if not exists uploaded_at timestamptz;

do $$ begin
  alter table public.session_resources
    add constraint session_resources_size_bytes_check
    check (size_bytes is null or (size_bytes > 0 and size_bytes <= 4194304));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.session_resources
    add constraint session_resources_sha256_check
    check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.session_resources
    add constraint session_resources_private_file_metadata_check
    check (
      uploaded_at is null
      or (
        storage_path is not null
        and file_name is not null
        and mime_type is not null
        and size_bytes is not null
        and sha256 is not null
      )
    ) not valid;
exception when duplicate_object then null; end $$;

create index if not exists session_resources_session_active_access_idx
  on public.session_resources (class_session_id, access_level, sort_order, created_at)
  where is_active = true;

alter table public.session_resources enable row level security;

-- The permissive policy grants only the three intended audiences. The matching
-- restrictive policy preserves that boundary even if an older broad SELECT
-- policy is still present in a deployed project.
drop policy if exists realms_session_resources_authorized_read on public.session_resources;
create policy realms_session_resources_authorized_read
  on public.session_resources
  for select
  to authenticated
  using (
    public.current_user_has_lms_role('admin')
    or exists (
      select 1
      from public.class_sessions
      where class_sessions.id = session_resources.class_session_id
        and (
          (
            session_resources.is_active = true
            and session_resources.access_level = 'enrolled_students'
            and class_sessions.visibility_status = 'enrolled_only'
            and public.current_student_enrolled_in_offering(class_sessions.cohort_course_id)
          )
          or class_sessions.facilitator_id in (
            select facilitators.id
            from public.facilitators
            where facilitators.profile_id = auth.uid()
              and facilitators.active = true
          )
          or public.current_facilitator_assigned_to_offering(class_sessions.cohort_course_id)
        )
    )
  );

drop policy if exists realms_session_resources_authorized_boundary on public.session_resources;
create policy realms_session_resources_authorized_boundary
  on public.session_resources
  as restrictive
  for select
  to authenticated
  using (
    public.current_user_has_lms_role('admin')
    or exists (
      select 1
      from public.class_sessions
      where class_sessions.id = session_resources.class_session_id
        and (
          (
            session_resources.is_active = true
            and session_resources.access_level = 'enrolled_students'
            and class_sessions.visibility_status = 'enrolled_only'
            and public.current_student_enrolled_in_offering(class_sessions.cohort_course_id)
          )
          or class_sessions.facilitator_id in (
            select facilitators.id
            from public.facilitators
            where facilitators.profile_id = auth.uid()
              and facilitators.active = true
          )
          or public.current_facilitator_assigned_to_offering(class_sessions.cohort_course_id)
        )
    )
  );

-- Keep all four private workflow buckets unavailable to ordinary direct object
-- reads/writes. Authorised server routes use the service role only after domain
-- ownership or facilitator/admin assignment checks.
drop policy if exists realms_private_workflow_objects_server_only on storage.objects;
create policy realms_private_workflow_objects_server_only
  on storage.objects
  as restrictive
  for all
  to public
  using (
    bucket_id not in (
      'assessment-submissions',
      'absence-evidence',
      'institutional-awards',
      'learning-resources'
    )
  )
  with check (
    bucket_id not in (
      'assessment-submissions',
      'absence-evidence',
      'institutional-awards',
      'learning-resources'
    )
  );

-- No facilitator INSERT/UPDATE/DELETE policy is added to session_resources here.
-- The application uses authenticated, server-only routes that first verify the
-- exact session assignment and only then use the service-role client. Existing
-- student SELECT policies should remain unchanged and continue limiting rows to
-- active enrolled-student resources for owned offerings.
