-- REALMS Institute NEXT 4: private assessment, absence-evidence and award storage.
-- Apply separately. Do not expose these buckets through public or broad authenticated policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('assessment-submissions', 'assessment-submissions', false, 52428800, array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/jpeg','image/png','image/webp','application/zip','application/x-zip-compressed']::text[]),
  ('absence-evidence', 'absence-evidence', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp']::text[]),
  ('institutional-awards', 'institutional-awards', false, 10485760, array['application/pdf']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.assignment_submission_artifacts
  add column if not exists storage_bucket text,
  add column if not exists sha256 text,
  add column if not exists artifact_status text not null default 'active',
  add column if not exists uploaded_by uuid,
  add column if not exists uploaded_at timestamptz;

alter table public.absence_request_evidence
  add column if not exists storage_bucket text,
  add column if not exists sha256 text,
  add column if not exists evidence_status text not null default 'active',
  add column if not exists uploaded_by uuid,
  add column if not exists uploaded_at timestamptz;

alter table public.institutional_awards
  add column if not exists document_storage_bucket text,
  add column if not exists document_mime_type text,
  add column if not exists document_size_bytes bigint,
  add column if not exists document_uploaded_at timestamptz;

do $$ begin
  alter table public.assignment_submission_artifacts add constraint assignment_artifact_storage_pair_check check (
    (storage_path is null and storage_bucket is null)
    or (storage_path is not null and storage_bucket = 'assessment-submissions')
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.assignment_submission_artifacts add constraint assignment_artifact_status_check check (artifact_status in ('active','superseded','removed'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.assignment_submission_artifacts add constraint assignment_artifact_sha256_check check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.absence_request_evidence add constraint absence_evidence_storage_pair_check check (
    (storage_path is null and storage_bucket is null)
    or (storage_path is not null and storage_bucket = 'absence-evidence')
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.absence_request_evidence add constraint absence_evidence_status_check check (evidence_status in ('active','superseded','removed'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.absence_request_evidence add constraint absence_evidence_sha256_check check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.institutional_awards add constraint institutional_award_storage_bucket_check check (document_storage_bucket is null or document_storage_bucket = 'institutional-awards');
exception when duplicate_object then null; end $$;

create index if not exists assignment_submission_artifacts_submission_active_idx
  on public.assignment_submission_artifacts (submission_id, created_at desc)
  where artifact_status = 'active';

create index if not exists absence_request_evidence_request_active_idx
  on public.absence_request_evidence (absence_request_id, created_at desc)
  where evidence_status = 'active';

-- This restrictive policy grants nothing. It prevents any current or future
-- broad permissive policy from allowing direct browser access to these buckets,
-- while the service role continues to bypass RLS for authorised server routes.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'realms_private_workflow_objects_server_only'
  ) then
    create policy realms_private_workflow_objects_server_only
      on storage.objects
      as restrictive
      for all
      to public
      using (bucket_id not in ('assessment-submissions', 'absence-evidence', 'institutional-awards'))
      with check (bucket_id not in ('assessment-submissions', 'absence-evidence', 'institutional-awards'));
  end if;
end $$;

-- Authenticated server routes re-authorise domain ownership/assignment. Only
-- the service role mutates storage or creates short-lived signed downloads.
