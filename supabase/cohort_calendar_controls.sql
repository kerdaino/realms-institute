-- REVIEW-ONLY MIGRATION. Do not run automatically.
-- Adds reusable cohort-owned calendar boundaries. It does not change any
-- cohort, session, assessment, attendance, announcement, or graduation data.

alter table public.cohorts
  add column if not exists teaching_start_date date,
  add column if not exists teaching_end_date date,
  add column if not exists teaching_week_count smallint,
  add column if not exists completion_period_start_date date,
  add column if not exists completion_period_end_date date,
  add column if not exists orientation_start_at timestamptz,
  add column if not exists matriculation_start_at timestamptz,
  add column if not exists graduation_start_at timestamptz;

alter table public.cohorts
  drop constraint if exists cohorts_teaching_week_count_check,
  add constraint cohorts_teaching_week_count_check
    check (teaching_week_count is null or teaching_week_count between 1 and 52),
  drop constraint if exists cohorts_teaching_dates_check,
  add constraint cohorts_teaching_dates_check
    check (
      (teaching_start_date is null and teaching_end_date is null)
      or (teaching_start_date is not null and teaching_end_date >= teaching_start_date)
    ),
  drop constraint if exists cohorts_completion_period_dates_check,
  add constraint cohorts_completion_period_dates_check
    check (
      (completion_period_start_date is null and completion_period_end_date is null)
      or (completion_period_start_date is not null and completion_period_end_date >= completion_period_start_date)
    ),
  drop constraint if exists cohorts_teaching_before_completion_check,
  add constraint cohorts_teaching_before_completion_check
    check (
      teaching_end_date is null
      or completion_period_start_date is null
      or completion_period_start_date > teaching_end_date
    );

comment on column public.cohorts.teaching_week_count is 'Approved normal teaching-week count; completion or reconciliation periods are not teaching weeks.';
comment on column public.cohorts.completion_period_start_date is 'Start of the separately classified final completion, assessment, catch-up, or reconciliation period.';
comment on column public.cohorts.orientation_start_at is 'Exact approved orientation timestamp when configured; null means the time is not yet approved.';
comment on column public.cohorts.matriculation_start_at is 'Exact approved matriculation timestamp when configured; null means the time is not yet approved.';
comment on column public.cohorts.graduation_start_at is 'Exact approved graduation timestamp when configured; null means the time is not yet approved.';
