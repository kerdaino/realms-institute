-- REALMS Zoom cloud-recording evidence. Apply after lms_build_7_recorded_learning.sql.
-- Review and apply manually; application code does not execute production SQL.

create table if not exists public.zoom_recording_viewer_evidence (
  id uuid primary key default gen_random_uuid(),
  class_recording_id uuid not null references public.class_recordings(id) on delete cascade,
  zoom_recording_identifier text not null,
  viewer_name text,
  viewer_email text not null,
  viewed_at timestamptz,
  zoom_reported_view_duration_seconds integer check (zoom_reported_view_duration_seconds is null or zoom_reported_view_duration_seconds >= 0),
  source_hash text not null unique,
  evidence_status text not null default 'unmatched' check (evidence_status in ('unmatched','matched','verified','rejected')),
  matched_student_id uuid references public.students(id) on delete set null,
  matched_course_enrollment_id uuid references public.course_enrollments(id) on delete set null,
  matched_recording_assignment_id uuid references public.recording_learning_assignments(id) on delete set null,
  raw_source jsonb not null default '{}'::jsonb,
  imported_by text,
  reviewed_by text,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (evidence_status = 'unmatched' and matched_student_id is null and matched_course_enrollment_id is null and matched_recording_assignment_id is null)
    or
    (evidence_status <> 'unmatched' and matched_student_id is not null and matched_course_enrollment_id is not null and matched_recording_assignment_id is not null)
  )
);

create index if not exists zoom_viewing_evidence_recording_idx on public.zoom_recording_viewer_evidence(class_recording_id, evidence_status, created_at desc);
create index if not exists zoom_viewing_evidence_email_idx on public.zoom_recording_viewer_evidence(lower(viewer_email));
create unique index if not exists zoom_viewing_evidence_assignment_source_idx on public.zoom_recording_viewer_evidence(matched_recording_assignment_id, source_hash) where matched_recording_assignment_id is not null;

alter table public.zoom_recording_viewer_evidence enable row level security;
-- No authenticated policies: raw viewer identity evidence is admin/server-only.
revoke all on public.zoom_recording_viewer_evidence from anon, authenticated;
grant select, insert, update on public.zoom_recording_viewer_evidence to service_role;
