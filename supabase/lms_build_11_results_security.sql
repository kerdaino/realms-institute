-- REALMS Institute LMS / SIS Build 11: result security and workflow guarantees.
-- Apply after the Build 11 migration that creates the 13 result tables and seed data.
-- This file does not recreate scoring or graduation tables.

alter table public.student_engagement_component_evaluations
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text;

alter table public.academic_result_batches
  add column if not exists authority_reference text;

create unique index if not exists programme_scoring_policy_cohort_unique_idx on public.programme_scoring_policies(cohort_id);
create unique index if not exists programme_score_category_policy_code_unique_idx on public.programme_score_categories(scoring_policy_id, category_code);
create unique index if not exists assessment_weighting_category_assessment_unique_idx on public.assessment_weightings(score_category_id, assessment_type, assessment_id);
create unique index if not exists engagement_component_student_category_unique_idx on public.student_engagement_component_evaluations(student_enrollment_id, score_category_id);
create unique index if not exists capstone_defence_student_assignment_unique_idx on public.capstone_defences(student_enrollment_id, capstone_assignment_id);
create unique index if not exists component_score_student_category_unique_idx on public.student_component_scores(student_enrollment_id, score_category_id);
create unique index if not exists programme_result_student_policy_unique_idx on public.student_programme_results(student_enrollment_id, scoring_policy_id);
create unique index if not exists graduation_definition_policy_code_unique_idx on public.graduation_requirement_definitions(scoring_policy_id, requirement_code);
create unique index if not exists graduation_tracker_student_definition_unique_idx on public.student_graduation_requirements(student_enrollment_id, requirement_definition_id);
create unique index if not exists result_batch_item_unique_idx on public.academic_result_batch_items(result_batch_id, student_programme_result_id);
create index if not exists programme_result_dashboard_idx on public.student_programme_results(result_status, result_outcome, all_graduation_gates_met);
create index if not exists graduation_tracker_status_idx on public.student_graduation_requirements(student_enrollment_id, requirement_status);
create index if not exists result_change_timeline_idx on public.programme_result_change_events(student_programme_result_id, created_at desc);

do $$ begin alter table public.assessment_weightings add constraint assessment_weightings_type_check check (assessment_type in ('assignment','quiz')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.assessment_weightings add constraint assessment_weightings_attempt_selection_check check (attempt_selection in ('best_graded','latest_graded','first_graded')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.assessment_weightings add constraint assessment_weightings_positive_weight_check check (weight_units > 0); exception when duplicate_object then null; end $$;
do $$ begin alter table public.student_engagement_component_evaluations add constraint engagement_evaluation_status_check check (evaluation_status in ('pending','evaluated','moderated','approved')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.capstone_defences add constraint capstone_defence_status_check check (defence_status in ('not_scheduled','scheduled','completed','reschedule_required','cancelled')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.capstone_defences add constraint capstone_defence_outcome_check check (defence_outcome is null or defence_outcome in ('passed','revision_required','not_passed')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.student_graduation_requirements add constraint graduation_requirement_status_check check (requirement_status in ('pending','met','not_met','under_review','waived','not_applicable')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.student_programme_results add constraint programme_result_status_check check (result_status in ('draft','calculated','review_required','submitted_for_approval','approved','published','withheld','corrected')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.student_programme_results add constraint programme_result_outcome_check check (result_outcome is null or result_outcome in ('eligible_for_completion','not_yet_eligible','incomplete','resit_required','deferred_result','failed','withheld','under_review')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.academic_result_batches add constraint academic_result_batch_status_check check (batch_status in ('draft','prepared','submitted_for_review','reviewed','approved','published','withdrawn')); exception when duplicate_object then null; end $$;

alter table public.programme_scoring_policies enable row level security;
alter table public.programme_score_categories enable row level security;
alter table public.assessment_weightings enable row level security;
alter table public.student_engagement_component_evaluations enable row level security;
alter table public.capstone_defences enable row level security;
alter table public.student_component_scores enable row level security;
alter table public.student_programme_results enable row level security;
alter table public.graduation_requirement_definitions enable row level security;
alter table public.student_graduation_requirements enable row level security;
alter table public.academic_result_batches enable row level security;
alter table public.academic_result_batch_items enable row level security;
alter table public.programme_result_change_events enable row level security;
alter table public.graduation_requirement_events enable row level security;

revoke all on public.programme_scoring_policies, public.programme_score_categories, public.assessment_weightings,
  public.student_engagement_component_evaluations, public.capstone_defences, public.student_component_scores,
  public.student_programme_results, public.graduation_requirement_definitions, public.student_graduation_requirements,
  public.academic_result_batches, public.academic_result_batch_items, public.programme_result_change_events,
  public.graduation_requirement_events from anon, authenticated;

grant select on public.programme_scoring_policies, public.programme_score_categories,
  public.graduation_requirement_definitions to authenticated;

grant select (id, student_enrollment_id, scoring_policy_id, discipleship_points,
  skill_points, engagement_points, total_points, discipleship_gate_met,
  skill_gate_met, engagement_gate_met, overall_score_gate_met, capstone_gate_met,
  capstone_defence_gate_met, final_discipleship_assessment_gate_met,
  attendance_compliance_gate_met, catchup_requirements_gate_met,
  integrity_conduct_gate_met, all_graduation_gates_met, result_outcome,
  result_status, calculation_version, approved_at, published_at, created_at,
  updated_at) on public.student_programme_results to authenticated;

grant select (id, student_enrollment_id, score_category_id, raw_percentage,
  weighted_points, maximum_points, evidence_complete, calculation_status,
  calculated_at, moderated_points, created_at, updated_at)
  on public.student_component_scores to authenticated;

grant select (id, student_enrollment_id, requirement_definition_id,
  requirement_status, current_value, required_value, evidence_summary,
  evaluated_at, manually_overridden, created_at, updated_at)
  on public.student_graduation_requirements to authenticated;

drop policy if exists "authenticated users read active result policies" on public.programme_scoring_policies;
create policy "authenticated users read active result policies" on public.programme_scoring_policies for select to authenticated using (policy_status = 'active');

drop policy if exists "authenticated users read active score categories" on public.programme_score_categories;
create policy "authenticated users read active score categories" on public.programme_score_categories for select to authenticated using (active = true);

drop policy if exists "authenticated users read active graduation definitions" on public.graduation_requirement_definitions;
create policy "authenticated users read active graduation definitions" on public.graduation_requirement_definitions for select to authenticated using (active = true);

drop policy if exists "students read own published programme result" on public.student_programme_results;
create policy "students read own published programme result" on public.student_programme_results for select to authenticated using (
  result_status = 'published' and exists (
    select 1 from public.student_enrollments
    join public.students on students.id = student_enrollments.student_id
    where student_enrollments.id = student_programme_results.student_enrollment_id
      and students.profile_id = auth.uid()
  )
);

drop policy if exists "students read own published component scores" on public.student_component_scores;
create policy "students read own published component scores" on public.student_component_scores for select to authenticated using (
  exists (
    select 1 from public.student_programme_results
    join public.student_enrollments on student_enrollments.id = student_programme_results.student_enrollment_id
    join public.students on students.id = student_enrollments.student_id
    where student_programme_results.student_enrollment_id = student_component_scores.student_enrollment_id
      and student_programme_results.result_status = 'published'
      and students.profile_id = auth.uid()
  )
);

drop policy if exists "students read own graduation tracker" on public.student_graduation_requirements;
create policy "students read own graduation tracker" on public.student_graduation_requirements for select to authenticated using (
  exists (
    select 1 from public.student_enrollments
    join public.students on students.id = student_enrollments.student_id
    where student_enrollments.id = student_graduation_requirements.student_enrollment_id
      and students.profile_id = auth.uid()
  )
);

-- All Build 11 writes and all private workflow reads remain server-owned. The
-- service-role client is used only after the existing admin or facilitator gate.
-- Students receive no direct write policy, no batch or moderation access, and no
-- result until the independent publication state is reached. Column grants also
-- keep calculation details, moderation notes, override reasons, withholding
-- reasons, private history, and internal snapshots outside normal student reads.
