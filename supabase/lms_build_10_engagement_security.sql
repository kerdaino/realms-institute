-- REALMS Institute LMS / SIS Build 10: engagement and standing security
-- Apply after the migration that created the Build 10 tables and columns.
-- This file deliberately does not recreate any Build 10 table.
-- Protected server routes re-authorise admin, student ownership, or active mentor
-- caseload before service-role reads/writes and return minimal role-specific DTOs.

create unique index if not exists engagement_alert_deduplication_unique_idx on public.student_engagement_alerts(student_enrollment_id, deduplication_key);
create unique index if not exists engagement_rule_cohort_code_unique_idx on public.engagement_alert_rules(cohort_id, rule_code);
create unique index if not exists warning_notice_alert_unique_idx on public.student_warning_notice_alerts(warning_notice_id, engagement_alert_id);
create unique index if not exists notice_delivery_channel_unique_idx on public.student_notice_deliveries(warning_notice_id, channel);
create unique index if not exists active_primary_mentor_assignment_unique_idx on public.mentor_assignments(student_enrollment_id) where assignment_status = 'active';
create index if not exists engagement_alert_attention_idx on public.student_engagement_alerts(alert_status, severity, last_detected_at desc);
create index if not exists warning_notice_student_status_idx on public.student_warning_notices(student_enrollment_id, notice_status, issued_at desc);
create index if not exists mentor_assignment_caseload_idx on public.mentor_assignments(mentor_profile_id, assignment_status, assigned_at desc);
create index if not exists mentor_followup_timeline_idx on public.mentor_followups(mentor_assignment_id, contacted_at desc);
create index if not exists recovery_plan_student_status_idx on public.student_recovery_plans(student_enrollment_id, plan_status, created_at desc);
create index if not exists review_case_student_status_idx on public.student_status_review_cases(student_enrollment_id, case_status, opened_at desc);
create index if not exists standing_history_timeline_idx on public.student_standing_change_events(student_enrollment_id, created_at desc);

do $$ begin alter table public.student_enrollments add constraint academic_standing_value_check check (academic_standing in ('good_standing','reminder','warning','participation_review','probation','deferment_review','withdrawal_review')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.student_warning_notices add constraint warning_notice_type_check check (notice_type in ('reminder','formal_warning','participation_review_notice','probation_notice','deferment_review_notice','withdrawal_review_notice','recovery_plan_notice')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.student_warning_notices add constraint warning_notice_status_check check (notice_status in ('draft','issued','acknowledged','responded','resolved','withdrawn')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.student_recovery_plans add constraint recovery_plan_status_check check (plan_status in ('draft','active','completed','closed','unsuccessful','cancelled')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.student_status_review_cases add constraint review_case_type_check check (review_type in ('participation_review','probation_review','deferment_review','withdrawal_review')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.student_status_review_cases add constraint review_case_status_check check (case_status in ('open','evidence_review','awaiting_student_response','decision_pending','closed')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.student_status_review_cases add constraint review_case_outcome_check check (decision_outcome is null or decision_outcome in ('no_further_action','reminder','support_plan','recovery_plan','probation','exceptional_approval','deferment_recommended','withdrawal_recommended','case_closed')); exception when duplicate_object then null; end $$;

alter table public.engagement_alert_rules enable row level security;
alter table public.student_engagement_alerts enable row level security;
alter table public.student_warning_notices enable row level security;
alter table public.student_warning_notice_alerts enable row level security;
alter table public.student_warning_notice_events enable row level security;
alter table public.student_notice_deliveries enable row level security;
alter table public.mentor_assignments enable row level security;
alter table public.mentor_followups enable row level security;
alter table public.student_recovery_plans enable row level security;
alter table public.recovery_plan_actions enable row level security;
alter table public.recovery_plan_events enable row level security;
alter table public.student_status_review_cases enable row level security;
alter table public.student_status_review_private_notes enable row level security;
alter table public.student_standing_change_events enable row level security;
alter table public.student_support_referrals enable row level security;

revoke select, insert, update, delete on public.engagement_alert_rules, public.student_engagement_alerts, public.student_warning_notices, public.student_warning_notice_alerts, public.student_warning_notice_events, public.student_notice_deliveries, public.mentor_assignments, public.mentor_followups, public.student_recovery_plans, public.recovery_plan_actions, public.recovery_plan_events, public.student_status_review_cases, public.student_status_review_private_notes, public.student_standing_change_events, public.student_support_referrals from anon, authenticated;

-- No direct authenticated policy is intentionally created. Column-level privacy
-- cannot be enforced by a broad owner/caseload SELECT policy: draft notices,
-- mentor summaries, private case notes, and support referrals have different
-- audiences. Server-side DTOs enforce those boundaries after authentication.
