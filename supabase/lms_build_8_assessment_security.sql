-- REALMS Institute LMS / SIS Build 8: assessment security and integration
-- Apply after the migration that created the ten Build 8 assessment tables.
-- Application mutations use authenticated server routes with explicit ownership;
-- authenticated database users receive read-only, least-privilege access.

alter table public.session_recording_requirements add column if not exists quiz_id uuid references public.quizzes(id) on delete set null;
alter table public.session_recording_requirements add column if not exists practical_assignment_id uuid references public.assignments(id) on delete set null;
alter table public.session_recording_requirements add column if not exists reflection_assignment_id uuid references public.assignments(id) on delete set null;

create unique index if not exists assignment_submission_attempt_unique_idx on public.assignment_submissions(assignment_id, course_enrollment_id, attempt_number);
create unique index if not exists assignment_rubric_score_unique_idx on public.assignment_rubric_scores(submission_id, rubric_criterion_id);
create unique index if not exists quiz_attempt_number_unique_idx on public.quiz_attempts(quiz_id, course_enrollment_id, attempt_number);
create unique index if not exists quiz_attempt_answer_unique_idx on public.quiz_attempt_answers(quiz_attempt_id, question_id);
create unique index if not exists quiz_answer_key_question_unique_idx on public.quiz_answer_keys(question_id);
create index if not exists assignments_offering_status_due_idx on public.assignments(cohort_course_id, assignment_status, due_at);
create index if not exists assignment_submissions_review_idx on public.assignment_submissions(assignment_id, submission_status, submitted_at desc);
create index if not exists quizzes_offering_status_window_idx on public.quizzes(cohort_course_id, quiz_status, opens_at, closes_at);
create index if not exists quiz_attempts_review_idx on public.quiz_attempts(quiz_id, attempt_status, started_at desc);

do $$ begin alter table public.assignments add constraint assignments_domain_check check (assessment_domain in ('discipleship','skill')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.assignments add constraint assignments_status_check check (assignment_status in ('draft','published','closed','archived')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.assignments add constraint assignments_score_attempt_check check (max_score > 0 and max_submission_attempts > 0); exception when duplicate_object then null; end $$;
do $$ begin alter table public.quizzes add constraint quizzes_domain_check check (assessment_domain in ('discipleship','skill')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.quizzes add constraint quizzes_status_check check (quiz_status in ('draft','published','closed','archived')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.quizzes add constraint quizzes_limits_check check (max_attempts > 0 and passing_score_percentage between 0 and 100 and (duration_minutes is null or duration_minutes > 0)); exception when duplicate_object then null; end $$;
do $$ begin alter table public.quiz_questions add constraint quiz_question_type_check check (question_type in ('multiple_choice','true_false','short_answer') and points > 0); exception when duplicate_object then null; end $$;

alter table public.assignments enable row level security;
alter table public.assignment_rubric_criteria enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.assignment_submission_artifacts enable row level security;
alter table public.assignment_rubric_scores enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_answer_keys enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_attempt_answers enable row level security;
alter table public.assessment_grade_change_events enable row level security;

revoke insert, update, delete on public.assignments, public.assignment_rubric_criteria, public.assignment_submissions, public.assignment_submission_artifacts, public.assignment_rubric_scores, public.quizzes, public.quiz_questions, public.quiz_answer_keys, public.quiz_attempts, public.quiz_attempt_answers, public.assessment_grade_change_events from anon, authenticated;
revoke select on public.quiz_answer_keys, public.assessment_grade_change_events from anon, authenticated;

create or replace function public.current_user_owns_course_enrollment(target_enrollment_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.course_enrollments
    join public.student_enrollments on student_enrollments.id = course_enrollments.student_enrollment_id
    join public.students on students.id = student_enrollments.student_id
    where course_enrollments.id = target_enrollment_id and students.profile_id = auth.uid()
  );
$$;

drop policy if exists "students and assigned facilitators read assignments" on public.assignments;
create policy "students and assigned facilitators read assignments" on public.assignments for select to authenticated using (
  (assignment_status = 'published' and exists (select 1 from public.course_enrollments where course_enrollments.cohort_course_id = assignments.cohort_course_id and public.current_user_owns_course_enrollment(course_enrollments.id)))
  or public.current_facilitator_assigned_to_offering(cohort_course_id)
);

drop policy if exists "students and assigned facilitators read assignment rubrics" on public.assignment_rubric_criteria;
create policy "students and assigned facilitators read assignment rubrics" on public.assignment_rubric_criteria for select to authenticated using (
  exists (select 1 from public.assignments where assignments.id = assignment_rubric_criteria.assignment_id and ((assignments.assignment_status = 'published' and exists (select 1 from public.course_enrollments where course_enrollments.cohort_course_id = assignments.cohort_course_id and public.current_user_owns_course_enrollment(course_enrollments.id))) or public.current_facilitator_assigned_to_offering(assignments.cohort_course_id)))
);

drop policy if exists "students own and facilitators assigned read submissions" on public.assignment_submissions;
create policy "students own and facilitators assigned read submissions" on public.assignment_submissions for select to authenticated using (
  public.current_user_owns_course_enrollment(course_enrollment_id)
  or exists (select 1 from public.assignments where assignments.id = assignment_submissions.assignment_id and public.current_facilitator_assigned_to_offering(assignments.cohort_course_id))
);

drop policy if exists "students own and facilitators assigned read artifacts" on public.assignment_submission_artifacts;
create policy "students own and facilitators assigned read artifacts" on public.assignment_submission_artifacts for select to authenticated using (
  exists (select 1 from public.assignment_submissions join public.assignments on assignments.id = assignment_submissions.assignment_id where assignment_submissions.id = assignment_submission_artifacts.submission_id and (public.current_user_owns_course_enrollment(assignment_submissions.course_enrollment_id) or public.current_facilitator_assigned_to_offering(assignments.cohort_course_id)))
);

drop policy if exists "students own and facilitators assigned read rubric scores" on public.assignment_rubric_scores;
create policy "students own and facilitators assigned read rubric scores" on public.assignment_rubric_scores for select to authenticated using (
  exists (select 1 from public.assignment_submissions join public.assignments on assignments.id = assignment_submissions.assignment_id where assignment_submissions.id = assignment_rubric_scores.submission_id and (public.current_user_owns_course_enrollment(assignment_submissions.course_enrollment_id) or public.current_facilitator_assigned_to_offering(assignments.cohort_course_id)))
);

drop policy if exists "students and assigned facilitators read quizzes" on public.quizzes;
create policy "students and assigned facilitators read quizzes" on public.quizzes for select to authenticated using (
  (quiz_status = 'published' and exists (select 1 from public.course_enrollments where course_enrollments.cohort_course_id = quizzes.cohort_course_id and public.current_user_owns_course_enrollment(course_enrollments.id)))
  or public.current_facilitator_assigned_to_offering(cohort_course_id)
);

drop policy if exists "students and assigned facilitators read quiz questions" on public.quiz_questions;
create policy "students and assigned facilitators read quiz questions" on public.quiz_questions for select to authenticated using (
  exists (select 1 from public.quizzes where quizzes.id = quiz_questions.quiz_id and ((quizzes.quiz_status = 'published' and exists (select 1 from public.course_enrollments where course_enrollments.cohort_course_id = quizzes.cohort_course_id and public.current_user_owns_course_enrollment(course_enrollments.id))) or public.current_facilitator_assigned_to_offering(quizzes.cohort_course_id)))
);

drop policy if exists "students own and facilitators assigned read quiz attempts" on public.quiz_attempts;
create policy "students own and facilitators assigned read quiz attempts" on public.quiz_attempts for select to authenticated using (
  public.current_user_owns_course_enrollment(course_enrollment_id)
  or exists (select 1 from public.quizzes where quizzes.id = quiz_attempts.quiz_id and public.current_facilitator_assigned_to_offering(quizzes.cohort_course_id))
);

drop policy if exists "students own and facilitators assigned read quiz answers" on public.quiz_attempt_answers;
create policy "students own and facilitators assigned read quiz answers" on public.quiz_attempt_answers for select to authenticated using (
  exists (select 1 from public.quiz_attempts join public.quizzes on quizzes.id = quiz_attempts.quiz_id where quiz_attempts.id = quiz_attempt_answers.quiz_attempt_id and (public.current_user_owns_course_enrollment(quiz_attempts.course_enrollment_id) or public.current_facilitator_assigned_to_offering(quizzes.cohort_course_id)))
);

-- No authenticated SELECT policy is defined for quiz_answer_keys or grade-change
-- events. No direct authenticated DML is granted on any assessment table.
