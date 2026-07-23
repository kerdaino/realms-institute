-- Scholarship decision notification and payment-completion workflow.
-- Apply after the August 2026 registration schema and Build 13 abuse-protection
-- migration. This migration preserves all existing applications and decisions.

alter table public.registrations
  add column if not exists payment_expected_amount numeric,
  add column if not exists financial_requirement_status text not null default 'payment_required',
  add column if not exists payment_authorization_url text,
  add column if not exists payment_initialized_at timestamptz,
  add column if not exists scholarship_applicant_message text,
  add column if not exists scholarship_decision_email_sent boolean not null default false,
  add column if not exists scholarship_decision_email_sent_at timestamptz,
  add column if not exists scholarship_decision_email_type text,
  add column if not exists scholarship_decision_email_error text,
  add column if not exists scholarship_decision_email_last_attempted_at timestamptz;

-- Existing scholarship_approved_amount values retain their established meaning:
-- scholarship support / registration fee waived. For a partial scholarship,
-- amount due = normal fee (amount) - scholarship_approved_amount.
update public.registrations
set
  financial_requirement_status = case
    when funding_route = 'self_pay'
      and payment_status = 'success'
      and coalesce(amount_paid, 0) >= amount then 'satisfied_by_payment'
    when funding_route = 'scholarship_request'
      and scholarship_status = 'approved_partial'
      and scholarship_approved_amount > 0
      and scholarship_approved_amount < amount
      and payment_status = 'success'
      and coalesce(amount_paid, 0) >= amount - scholarship_approved_amount then 'satisfied_by_payment'
    when funding_route = 'scholarship_request'
      and scholarship_status = 'declined'
      and payment_status = 'success'
      and coalesce(amount_paid, 0) >= amount then 'satisfied_by_payment'
    when funding_route = 'scholarship_request'
      and scholarship_status = 'approved_full'
      and scholarship_approved_amount = amount then 'satisfied_by_scholarship'
    else 'payment_required'
  end,
  payment_expected_amount = case
    when funding_route = 'scholarship_request'
      and scholarship_status = 'approved_full'
      and scholarship_approved_amount = amount then 0
    when funding_route = 'scholarship_request'
      and scholarship_status = 'approved_partial'
      and scholarship_approved_amount > 0
      and scholarship_approved_amount < amount then amount - scholarship_approved_amount
    when funding_route = 'scholarship_request'
      and scholarship_status = 'declined' then amount
    when funding_route = 'self_pay' then amount
    else null
  end;

alter table public.registrations
  drop constraint if exists registrations_financial_requirement_status_check,
  drop constraint if exists registrations_payment_expected_amount_check;

alter table public.registrations
  add constraint registrations_financial_requirement_status_check
    check (financial_requirement_status in ('payment_required', 'satisfied_by_payment', 'satisfied_by_scholarship')) not valid,
  add constraint registrations_payment_expected_amount_check
    check (payment_expected_amount is null or payment_expected_amount >= 0) not valid;

alter table public.registrations
  validate constraint registrations_financial_requirement_status_check,
  validate constraint registrations_payment_expected_amount_check;

create index if not exists registrations_scholarship_decision_email_idx
  on public.registrations (scholarship_decision_email_sent, scholarship_decision_email_last_attempted_at)
  where funding_route = 'scholarship_request';
