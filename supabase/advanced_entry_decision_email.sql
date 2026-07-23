-- Advanced-entry decision notification audit support.
-- Review and apply separately after the August 2026 registration schema.
-- This migration preserves all applications, route decisions, scores, payment,
-- scholarship, admission and student-provisioning state.

alter table public.registrations
  add column if not exists advanced_entry_applicant_message text,
  add column if not exists advanced_entry_decision_email_sent boolean not null default false,
  add column if not exists advanced_entry_decision_email_sent_at timestamptz,
  add column if not exists advanced_entry_decision_email_type text,
  add column if not exists advanced_entry_decision_email_error text,
  add column if not exists advanced_entry_decision_email_last_attempted_at timestamptz,
  add column if not exists advanced_entry_decision_email_last_attempt_type text;

create index if not exists registrations_advanced_entry_decision_email_idx
  on public.registrations (advanced_entry_decision_email_sent, advanced_entry_decision_email_last_attempted_at)
  where advanced_entry_status in ('advanced_approved', 'foundation_required', 'more_information_required');
