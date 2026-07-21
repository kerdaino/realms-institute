import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { LmsAdminDataError } from "@/lib/lms/adminData";
import { calculateStudentEngagementMetrics } from "@/lib/lms/engagementService";

type Row = Record<string, unknown>;
function object(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function relation(value: unknown) { return Array.isArray(value) ? object(value[0]) : object(value); }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function fail(label: string, error: { code?: string } | null) { if (!error) return; console.error(label, { code: error.code }); throw new LmsAdminDataError(label); }

export type AtRiskFilters = { cohort?: string; student?: string; route?: string; skill?: string; standing?: string; alertType?: string; severity?: string; mentor?: string; recovery?: string; course?: string };

export async function fetchMentorOptions(supabase: SupabaseClient) {
  const role = await supabase.from("roles").select("id").eq("name", "mentor").maybeSingle();
  fail("Mentor role could not be loaded.", role.error);
  if (!role.data) return [];
  const assignments = await supabase.from("user_roles").select("user_id").eq("role_id", role.data.id);
  fail("Mentor authorisations could not be loaded.", assignments.error);
  const ids = (assignments.data ?? []).map((row) => row.user_id);
  if (!ids.length) return [];
  const profiles = await supabase.from("profiles").select("id, full_name, preferred_name, email, account_status").in("id", ids).eq("account_status", "active").order("full_name");
  fail("Mentor profiles could not be loaded.", profiles.error);
  return profiles.data ?? [];
}

export async function fetchAtRiskDashboard(supabase: SupabaseClient, filters: AtRiskFilters = {}) {
  const [enrollmentsResult, alertsResult, mentorsResult, plansResult, casesResult, cohortsResult, mentorOptions] = await Promise.all([
    supabase.from("student_enrollments").select("*, students(id, student_number, legal_name, preferred_name, email), cohorts(id, code, name, status)").in("enrolment_status", ["pending_onboarding", "active", "enrolled"]).order("updated_at", { ascending: false }),
    supabase.from("student_engagement_alerts").select("*").neq("alert_status", "resolved").order("last_detected_at", { ascending: false }),
    supabase.from("mentor_assignments").select("*, profiles(id, full_name, preferred_name, email)").eq("assignment_status", "active"),
    supabase.from("student_recovery_plans").select("id, student_enrollment_id, plan_status, plan_title").eq("plan_status", "active"),
    supabase.from("student_status_review_cases").select("id, student_enrollment_id, review_type, case_status").neq("case_status", "closed"),
    supabase.from("cohorts").select("id, code, name, status").order("start_date", { ascending: false, nullsFirst: false }),
    fetchMentorOptions(supabase),
  ]);
  for (const [label, result] of [["Student engagement records", enrollmentsResult], ["Engagement alerts", alertsResult], ["Mentor assignments", mentorsResult], ["Recovery plans", plansResult], ["Review cases", casesResult], ["Cohorts", cohortsResult]] as const) fail(`${label} could not be loaded.`, result.error);
  const alerts = (alertsResult.data ?? []) as Row[]; const mentorAssignments = (mentorsResult.data ?? []) as Row[]; const plans = (plansResult.data ?? []) as Row[]; const cases = (casesResult.data ?? []) as Row[];
  const search = filters.student?.trim().toLowerCase();
  const rows = ((enrollmentsResult.data ?? []) as Row[]).map((enrollment) => {
    const id = String(enrollment.id); const student = relation(enrollment.students); const cohort = relation(enrollment.cohorts);
    const studentAlerts = alerts.filter((row) => row.student_enrollment_id === id);
    const mentor = mentorAssignments.find((row) => row.student_enrollment_id === id) ?? null;
    const studentPlans = plans.filter((row) => row.student_enrollment_id === id);
    const studentCases = cases.filter((row) => row.student_enrollment_id === id);
    return { enrollment, student, cohort, alerts: studentAlerts, mentor, plans: studentPlans, cases: studentCases };
  }).filter((row) => row.alerts.length || row.enrollment.standing_review_required || row.enrollment.academic_standing !== "good_standing" || row.plans.length || row.cases.length).filter((row) => {
    if (filters.cohort && row.enrollment.cohort_id !== filters.cohort) return false;
    if (search && !`${text(row.student.legal_name)} ${text(row.student.preferred_name)} ${text(row.student.student_number)}`.toLowerCase().includes(search)) return false;
    if (filters.route && row.enrollment.discipleship_route !== filters.route) return false;
    if (filters.skill && row.enrollment.skill_pathway !== filters.skill) return false;
    if (filters.standing && row.enrollment.academic_standing !== filters.standing) return false;
    if (filters.alertType && !row.alerts.some((alert) => alert.signal_type === filters.alertType)) return false;
    if (filters.severity && !row.alerts.some((alert) => alert.severity === filters.severity)) return false;
    if (filters.mentor && row.mentor?.mentor_profile_id !== filters.mentor) return false;
    if (filters.recovery && !row.plans.some((plan) => plan.plan_status === filters.recovery)) return false;
    return true;
  });
  const maxSignalTotal = (signal: string) => rows.reduce((sum, row) => sum + Math.max(0, ...row.alerts.filter((alert) => alert.signal_type === signal).map((alert) => Number(alert.current_value) || 0)), 0);
  return {
    rows,
    cohorts: cohortsResult.data ?? [],
    mentorOptions,
    metrics: {
      studentsRequiringAttention: rows.length,
      openEngagementAlerts: rows.reduce((sum, row) => sum + row.alerts.length, 0),
      highSeverityAlerts: rows.reduce((sum, row) => sum + row.alerts.filter((alert) => alert.severity === "high").length, 0),
      attendanceReviewRequired: rows.filter((row) => row.enrollment.standing_review_required).length,
      overdueRecordedModules: maxSignalTotal("overdue_recorded_modules"),
      overdueMakeups: maxSignalTotal("overdue_makeups"),
      missingAssignments: maxSignalTotal("missing_assignments"),
      quizConcerns: maxSignalTotal("quizzes_with_attempts_exhausted"),
      integrityReviews: maxSignalTotal("open_integrity_reviews"),
      studentsWithoutAssignedMentor: rows.filter((row) => !row.mentor).length,
      activeRecoveryPlans: rows.reduce((sum, row) => sum + row.plans.length, 0),
      openParticipationReviews: rows.reduce((sum, row) => sum + row.cases.filter((item) => item.review_type === "participation_review").length, 0),
    },
  };
}

export async function fetchAtRiskStudentDetail(supabase: SupabaseClient, studentEnrollmentId: string) {
  const evaluation = await calculateStudentEngagementMetrics(supabase, studentEnrollmentId);
  const [alerts, notices, noticeEvents, mentor, followups, plans, actions, planEvents, cases, standing, mentorOptions] = await Promise.all([
    supabase.from("student_engagement_alerts").select("*").eq("student_enrollment_id", studentEnrollmentId).order("last_detected_at", { ascending: false }),
    supabase.from("student_warning_notices").select("*").eq("student_enrollment_id", studentEnrollmentId).order("created_at", { ascending: false }),
    supabase.from("student_warning_notice_events").select("*").in("warning_notice_id", (await supabase.from("student_warning_notices").select("id").eq("student_enrollment_id", studentEnrollmentId)).data?.map((row) => row.id) ?? ["00000000-0000-0000-0000-000000000000"]).order("created_at", { ascending: false }),
    supabase.from("mentor_assignments").select("*, profiles(id, full_name, preferred_name, email)").eq("student_enrollment_id", studentEnrollmentId).order("assigned_at", { ascending: false }),
    supabase.from("mentor_followups").select("*, mentor_assignments!inner(student_enrollment_id)").eq("mentor_assignments.student_enrollment_id", studentEnrollmentId).order("contacted_at", { ascending: false }),
    supabase.from("student_recovery_plans").select("*").eq("student_enrollment_id", studentEnrollmentId).order("created_at", { ascending: false }),
    supabase.from("recovery_plan_actions").select("*, student_recovery_plans!inner(student_enrollment_id)").eq("student_recovery_plans.student_enrollment_id", studentEnrollmentId).order("sort_order"),
    supabase.from("recovery_plan_events").select("*, student_recovery_plans!inner(student_enrollment_id)").eq("student_recovery_plans.student_enrollment_id", studentEnrollmentId).order("created_at", { ascending: false }),
    supabase.from("student_status_review_cases").select("*").eq("student_enrollment_id", studentEnrollmentId).order("opened_at", { ascending: false }),
    supabase.from("student_standing_change_events").select("*").eq("student_enrollment_id", studentEnrollmentId).order("created_at", { ascending: false }),
    fetchMentorOptions(supabase),
  ]);
  for (const [label, result] of [["Engagement alerts", alerts], ["Student notices", notices], ["Notice events", noticeEvents], ["Mentor assignments", mentor], ["Mentor follow-ups", followups], ["Recovery plans", plans], ["Recovery actions", actions], ["Recovery plan events", planEvents], ["Review cases", cases], ["Standing history", standing]] as const) fail(`${label} could not be loaded.`, result.error);
  return { ...evaluation, alerts: alerts.data ?? [], notices: notices.data ?? [], noticeEvents: noticeEvents.data ?? [], mentorAssignments: mentor.data ?? [], followups: followups.data ?? [], recoveryPlans: plans.data ?? [], recoveryActions: actions.data ?? [], recoveryPlanEvents: planEvents.data ?? [], reviewCases: cases.data ?? [], standingHistory: standing.data ?? [], mentorOptions };
}

async function enrollmentForStudentProfile(supabase: SupabaseClient, profileId: string) {
  const student = await supabase.from("students").select("id").eq("profile_id", profileId).maybeSingle();
  fail("Student identity could not be loaded.", student.error); if (!student.data) throw new LmsAdminDataError("Student access required.", 403);
  const enrollment = await supabase.from("student_enrollments").select("*, cohorts(id, code, name), students(id, student_number, legal_name, preferred_name, email)").eq("student_id", student.data.id).order("enrolled_at", { ascending: false }).limit(1).maybeSingle();
  fail("Student standing could not be loaded.", enrollment.error); if (!enrollment.data) throw new LmsAdminDataError("No student enrolment is available.", 404);
  return object(enrollment.data);
}

export async function fetchStudentStanding(supabase: SupabaseClient, profileId: string) {
  const enrollment = await enrollmentForStudentProfile(supabase, profileId); const id = String(enrollment.id);
  const [notices, mentor, plans, actions, cases] = await Promise.all([
    supabase.from("student_warning_notices").select("id, notice_type, title, reason_summary, required_action, response_due_at, notice_status, issued_at, acknowledged_at, student_response, responded_at, resolved_at").eq("student_enrollment_id", id).neq("notice_status", "draft").neq("notice_status", "withdrawn").order("issued_at", { ascending: false }),
    supabase.from("mentor_assignments").select("id, assigned_at, profiles(id, full_name, preferred_name, email)").eq("student_enrollment_id", id).eq("assignment_status", "active").maybeSingle(),
    supabase.from("student_recovery_plans").select("id, plan_title, reason_summary, plan_status, start_date, target_completion_date, student_acknowledged_at").eq("student_enrollment_id", id).in("plan_status", ["active", "completed"]).order("created_at", { ascending: false }),
    supabase.from("recovery_plan_actions").select("id, recovery_plan_id, action_type, title, description, due_at, action_status, completed_at, sort_order, student_recovery_plans!inner(student_enrollment_id)").eq("student_recovery_plans.student_enrollment_id", id).order("sort_order"),
    supabase.from("student_status_review_cases").select("id, review_type, case_title, concern_summary, case_status, opened_at, student_notified_at, response_due_at, student_response, student_responded_at, evidence_summary, decision_outcome, decision_rationale, decided_at, closed_at").eq("student_enrollment_id", id).not("student_notified_at", "is", null).order("opened_at", { ascending: false }),
  ]);
  for (const [label, result] of [["Standing notices", notices], ["Assigned mentor", mentor], ["Recovery plans", plans], ["Recovery actions", actions], ["Review cases", cases]] as const) fail(`${label} could not be loaded.`, result.error);
  return { enrollment, student: relation(enrollment.students), cohort: relation(enrollment.cohorts), notices: notices.data ?? [], mentor: mentor.data ?? null, recoveryPlans: plans.data ?? [], recoveryActions: actions.data ?? [], reviewCases: cases.data ?? [] };
}

export async function requireMentorCaseload(supabase: SupabaseClient, mentorProfileId: string, studentEnrollmentId?: string) {
  let query = supabase.from("mentor_assignments").select("id, student_enrollment_id, mentor_profile_id, assigned_at").eq("mentor_profile_id", mentorProfileId).eq("assignment_status", "active");
  if (studentEnrollmentId) query = query.eq("student_enrollment_id", studentEnrollmentId);
  const result = await query;
  fail("Mentor caseload could not be loaded.", result.error);
  if (studentEnrollmentId && !(result.data ?? []).length) throw new LmsAdminDataError("This student is not in your active mentor caseload.", 403);
  return result.data ?? [];
}

export async function fetchMentorStudents(supabase: SupabaseClient, mentorProfileId: string) {
  const assignments = await requireMentorCaseload(supabase, mentorProfileId);
  if (!assignments.length) return [];
  const ids = assignments.map((row) => row.student_enrollment_id);
  const enrollments = await supabase.from("student_enrollments").select("id, academic_standing, standing_review_required, last_meaningful_activity_at, students(id, student_number, legal_name, preferred_name), cohorts(id, code, name)").in("id", ids);
  fail("Mentor student records could not be loaded.", enrollments.error);
  const alerts = await supabase.from("student_engagement_alerts").select("id, student_enrollment_id, signal_type, severity, alert_title, alert_summary, alert_status").in("student_enrollment_id", ids).neq("alert_status", "resolved");
  fail("Mentor student indicators could not be loaded.", alerts.error);
  return (enrollments.data ?? []).map((enrollment) => ({ enrollment, student: relation(enrollment.students), cohort: relation(enrollment.cohorts), alerts: (alerts.data ?? []).filter((alert) => alert.student_enrollment_id === enrollment.id) }));
}

export async function fetchMentorStudentDetail(supabase: SupabaseClient, mentorProfileId: string, studentEnrollmentId: string) {
  const assignment = (await requireMentorCaseload(supabase, mentorProfileId, studentEnrollmentId))[0];
  const evaluation = await calculateStudentEngagementMetrics(supabase, studentEnrollmentId);
  const [alerts, notices, followups, plans, actions, cases] = await Promise.all([
    supabase.from("student_engagement_alerts").select("id, signal_type, severity, alert_title, alert_summary, alert_status, last_detected_at").eq("student_enrollment_id", studentEnrollmentId).neq("alert_status", "resolved"),
    supabase.from("student_warning_notices").select("id, notice_type, title, reason_summary, required_action, response_due_at, notice_status, student_response, responded_at").eq("student_enrollment_id", studentEnrollmentId).neq("notice_status", "draft"),
    supabase.from("mentor_followups").select("id, followup_type, contact_method, contacted_at, contact_status, contact_summary, agreed_next_action, next_followup_at, followup_outcome").eq("mentor_assignment_id", assignment.id).order("contacted_at", { ascending: false }),
    supabase.from("student_recovery_plans").select("id, plan_title, reason_summary, plan_status, start_date, target_completion_date, student_acknowledged_at").eq("student_enrollment_id", studentEnrollmentId).in("plan_status", ["draft", "active", "completed"]),
    supabase.from("recovery_plan_actions").select("id, recovery_plan_id, action_type, title, description, linked_entity_type, linked_entity_id, due_at, action_status, completed_at, verified_at, sort_order, student_recovery_plans!inner(student_enrollment_id)").eq("student_recovery_plans.student_enrollment_id", studentEnrollmentId).order("sort_order"),
    supabase.from("student_status_review_cases").select("id, review_type, case_title, concern_summary, case_status, response_due_at, student_response, student_responded_at, evidence_summary, decision_outcome").eq("student_enrollment_id", studentEnrollmentId).not("student_notified_at", "is", null),
  ]);
  for (const [label, result] of [["Mentor alerts", alerts], ["Mentor notices", notices], ["Mentor follow-ups", followups], ["Mentor recovery plans", plans], ["Mentor recovery actions", actions], ["Mentor review cases", cases]] as const) fail(`${label} could not be loaded.`, result.error);
  return { assignment, ...evaluation, alerts: alerts.data ?? [], notices: notices.data ?? [], followups: followups.data ?? [], recoveryPlans: plans.data ?? [], recoveryActions: actions.data ?? [], reviewCases: cases.data ?? [] };
}
