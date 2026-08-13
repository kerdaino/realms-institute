-- REALMS institutional announcement recipient-resolution expansion.
-- REVIEW AND APPLY MANUALLY before deploying the matching application code.
-- This migration does not publish announcements, send email, provision accounts,
-- or alter any admission, payment, matriculation, or cohort lifecycle decision.

alter table public.registrations
  add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;

update public.registrations as registrations
set cohort_id = cohorts.id
from public.cohorts as cohorts
where registrations.cohort_id is null
  and cohorts.code = registrations.cohort_code;

alter table public.institutional_announcements
  add column if not exists cohort_scope text,
  add column if not exists student_recipient_status text,
  add column if not exists explicit_student_ids uuid[] not null default '{}'::uuid[],
  add column if not exists explicit_facilitator_ids uuid[] not null default '{}'::uuid[];

update public.institutional_announcements
set cohort_scope = case when all_active_cohorts then 'active' else 'specific' end
where cohort_scope is null;

update public.institutional_announcements
set student_recipient_status = 'enrolled_active'
where student_recipient_status is null;

-- Preserve explicit selections from drafts created by the previous version,
-- which stored targeting choices only on draft recipient snapshots.
update public.institutional_announcements as announcements
set explicit_student_ids = case when cardinality(announcements.explicit_student_ids) = 0 then coalesce((
        select array_agg(distinct recipients.student_id)
        from public.institutional_announcement_recipients as recipients
        where recipients.announcement_id = announcements.id
          and recipients.explicit_selection
          and recipients.student_id is not null
      ), '{}'::uuid[]) else announcements.explicit_student_ids end,
    explicit_facilitator_ids = case when cardinality(announcements.explicit_facilitator_ids) = 0 then coalesce((
        select array_agg(distinct recipients.facilitator_id)
        from public.institutional_announcement_recipients as recipients
        where recipients.announcement_id = announcements.id
          and recipients.explicit_selection
          and recipients.facilitator_id is not null
      ), '{}'::uuid[]) else announcements.explicit_facilitator_ids end
where announcements.announcement_status = 'draft';

alter table public.institutional_announcements
  alter column cohort_scope set default 'specific',
  alter column cohort_scope set not null,
  alter column student_recipient_status set default 'confirmed_conditional',
  alter column student_recipient_status set not null;

alter table public.institutional_announcements
  drop constraint if exists institutional_announcements_cohort_scope_check,
  drop constraint if exists institutional_announcements_student_recipient_status_check,
  add constraint institutional_announcements_cohort_scope_check
    check (cohort_scope in ('specific', 'current_upcoming', 'active')) not valid,
  add constraint institutional_announcements_student_recipient_status_check
    check (student_recipient_status in ('enrolled_active', 'confirmed_active', 'confirmed_conditional')) not valid;

alter table public.institutional_announcements
  validate constraint institutional_announcements_cohort_scope_check;
alter table public.institutional_announcements
  validate constraint institutional_announcements_student_recipient_status_check;

alter table public.institutional_announcement_recipients
  add column if not exists registration_id uuid references public.registrations(id) on delete restrict,
  add column if not exists recipient_class text,
  add column if not exists portal_visible boolean;

update public.institutional_announcement_recipients
set recipient_class = case when recipient_type = 'facilitator' then 'facilitator' else 'confirmed' end
where recipient_class is null;

update public.institutional_announcement_recipients
set portal_visible = recipient_type in ('student', 'facilitator')
where portal_visible is null;

alter table public.institutional_announcement_recipients
  alter column recipient_class set not null,
  alter column portal_visible set not null,
  alter column portal_visible set default false,
  drop constraint if exists institutional_announcement_recipients_recipient_type_check,
  drop constraint if exists institutional_announcement_recipients_check,
  drop constraint if exists institutional_announcement_recipients_recipient_identity_check,
  drop constraint if exists institutional_announcement_recipients_recipient_class_check,
  add constraint institutional_announcement_recipients_recipient_type_check
    check (recipient_type in ('student', 'applicant', 'facilitator')) not valid,
  add constraint institutional_announcement_recipients_recipient_identity_check
    check (
      (recipient_type = 'student' and student_id is not null and registration_id is null and facilitator_id is null and portal_visible)
      or (recipient_type = 'applicant' and student_id is null and registration_id is not null and facilitator_id is null and not portal_visible)
      or (recipient_type = 'facilitator' and student_id is null and registration_id is null and facilitator_id is not null and portal_visible)
    ) not valid,
  add constraint institutional_announcement_recipients_recipient_class_check
    check (recipient_class in ('confirmed', 'conditional', 'facilitator')) not valid;

alter table public.institutional_announcement_recipients
  validate constraint institutional_announcement_recipients_recipient_type_check;
alter table public.institutional_announcement_recipients
  validate constraint institutional_announcement_recipients_recipient_identity_check;
alter table public.institutional_announcement_recipients
  validate constraint institutional_announcement_recipients_recipient_class_check;

create unique index if not exists institutional_announcement_applicant_recipient_uidx
  on public.institutional_announcement_recipients (announcement_id, registration_id)
  where registration_id is not null;

create index if not exists institutional_announcement_recipient_class_idx
  on public.institutional_announcement_recipients (announcement_id, recipient_class);

revoke all on public.institutional_announcements, public.institutional_announcement_recipients from anon, authenticated;
