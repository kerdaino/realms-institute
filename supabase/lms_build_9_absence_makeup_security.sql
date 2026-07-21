-- REALMS Institute LMS / SIS Build 9: absence and make-up security
-- Apply after the migration that created the five Build 9 tables and after
-- lms_build_7_recorded_learning.sql (including requirement_snapshot).
-- Mutations are owned by protected server routes; direct authenticated access is read-only.

create unique index if not exists absence_request_enrollment_session_unique_idx on public.absence_requests(course_enrollment_id, class_session_id);
create unique index if not exists makeup_requirement_enrollment_session_purpose_unique_idx on public.makeup_requirements(course_enrollment_id, class_session_id, purpose_code);
create unique index if not exists makeup_requirement_absence_request_unique_idx on public.makeup_requirements(absence_request_id) where absence_request_id is not null;
create index if not exists absence_request_review_idx on public.absence_requests(request_status, submitted_at desc);
create index if not exists absence_request_event_timeline_idx on public.absence_request_events(absence_request_id, created_at desc);
create index if not exists makeup_requirement_work_idx on public.makeup_requirements(makeup_status, due_at);
create index if not exists makeup_requirement_event_timeline_idx on public.makeup_requirement_events(makeup_requirement_id, created_at desc);

do $$ begin alter table public.absence_requests add constraint absence_request_status_check check (request_status in ('draft','submitted','under_review','more_information_required','approved','declined','withdrawn')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.absence_requests add constraint absence_reason_category_check check (reason_category in ('illness','family_emergency','connectivity_or_power','work_or_school_conflict','travel','ministry_commitment','bereavement','other')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.makeup_requirements add constraint makeup_purpose_check check (purpose_code in ('MU-E','MU-U')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.makeup_requirements add constraint makeup_status_check check (makeup_status in ('awaiting_materials','assigned','not_started','in_progress','awaiting_checkpoint','awaiting_quiz','awaiting_practical','awaiting_reflection','awaiting_oral_verification','under_review','completed','late_complete','overdue','incomplete','waived','cancelled','integrity_review')); exception when duplicate_object then null; end $$;

alter table public.absence_requests enable row level security;
alter table public.absence_request_evidence enable row level security;
alter table public.absence_request_events enable row level security;
alter table public.makeup_requirements enable row level security;
alter table public.makeup_requirement_events enable row level security;

revoke insert, update, delete on public.absence_requests, public.absence_request_evidence, public.absence_request_events, public.makeup_requirements, public.makeup_requirement_events from anon, authenticated;
revoke select on public.absence_requests, public.absence_request_evidence, public.absence_request_events, public.makeup_requirements, public.makeup_requirement_events from anon, authenticated;

drop policy if exists "students read own absence requests" on public.absence_requests;
drop policy if exists "students read own absence evidence" on public.absence_request_evidence;
drop policy if exists "students read own absence events" on public.absence_request_events;
drop policy if exists "students and assigned facilitators read academic makeup" on public.makeup_requirements;
drop policy if exists "students read own academic makeup" on public.makeup_requirements;
drop policy if exists "students read own makeup events" on public.makeup_requirement_events;

-- No authenticated SELECT policy is intentionally defined on a Build 9 table.
-- A row policy cannot hide private_admin_note or other sensitive columns from an
-- owner who can select the row. Protected server routes therefore re-authorize
-- ownership or course assignment and return minimal role-specific DTOs instead.
