import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Cohort, Course, Facilitator, Student } from "@/lib/lms/types";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export class LmsAdminDataError extends Error {
  constructor(message: string, public readonly status = 500) {
    super(message);
    this.name = "LmsAdminDataError";
  }
}

export function requireLmsAdminClient() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new LmsAdminDataError("Supabase administrative access is not configured.", 503);
  return supabase;
}

function throwQueryError(label: string, error: { message: string } | null) {
  if (error) throw new LmsAdminDataError(`${label} could not be loaded.`);
}

type StudentEnrollmentView = {
  id: string;
  cohort_id: string;
  discipleship_route: string;
  skill_pathway: string;
  skill_learning_mode: string | null;
  enrolment_status: string;
  enrolled_at: string;
  cohorts: { id: string; code: string; name: string } | null;
};

export type AdminStudentListItem = Student & {
  profile_account_status: string | null;
  enrollment: StudentEnrollmentView | null;
};

export type StudentFilters = {
  search?: string;
  cohort?: string;
  route?: string;
  skill?: string;
  status?: string;
  onboarding?: string;
};

export async function fetchAdminStudents(supabase: SupabaseClient, filters: StudentFilters = {}) {
  const result = await supabase
    .from("students")
    .select("*, profiles(account_status), student_enrollments(id, cohort_id, discipleship_route, skill_pathway, skill_learning_mode, enrolment_status, enrolled_at, cohorts(id, code, name))")
    .order("created_at", { ascending: false })
    .limit(5000);
  throwQueryError("Students", result.error);
  const search = filters.search?.trim().toLowerCase();
  return (result.data ?? []).map((row) => {
    const raw = row as unknown as Student & { profiles: { account_status: string } | null; student_enrollments: StudentEnrollmentView[] };
    const enrollment = [...(raw.student_enrollments ?? [])].sort((a, b) => b.enrolled_at.localeCompare(a.enrolled_at))[0] ?? null;
    return { ...raw, profile_account_status: raw.profiles?.account_status ?? null, enrollment } as AdminStudentListItem;
  }).filter((student) => {
    if (search && ![student.legal_name, student.preferred_name, student.email, student.phone, student.student_number].some((value) => value?.toLowerCase().includes(search))) return false;
    if (filters.cohort && student.enrollment?.cohort_id !== filters.cohort) return false;
    if (filters.route && student.enrollment?.discipleship_route !== filters.route) return false;
    if (filters.skill && student.enrollment?.skill_pathway !== filters.skill) return false;
    if (filters.status && student.student_status !== filters.status) return false;
    if (filters.onboarding && student.onboarding_status !== filters.onboarding) return false;
    return true;
  });
}

export async function fetchAdminStudent(supabase: SupabaseClient, id: string) {
  const studentResult = await supabase.from("students").select("*, profiles(id, full_name, preferred_name, email, phone, account_status, created_at, updated_at)").eq("id", id).maybeSingle();
  throwQueryError("Student", studentResult.error);
  if (!studentResult.data) throw new LmsAdminDataError("Student not found.", 404);

  const [enrollments, courseEnrollments, notes, audits, registration] = await Promise.all([
    supabase.from("student_enrollments").select("*, cohorts(*)").eq("student_id", id).order("enrolled_at", { ascending: false }),
    supabase.from("course_enrollments").select("*, student_enrollments!inner(student_id), cohort_courses(*, courses(*), cohorts(id, code, name))").eq("student_enrollments.student_id", id).order("enrolled_at", { ascending: true }),
    supabase.from("student_notes").select("*").eq("student_id", id).order("created_at", { ascending: false }),
    supabase.from("audit_logs").select("*").eq("entity_type", "student").eq("entity_id", id).order("created_at", { ascending: false }).limit(100),
    studentResult.data.registration_id
      ? supabase.from("registrations").select("id, full_name, email, applicant_type, application_status, payment_status, funding_route, assigned_discipleship_route, skill_pathway, learning_mode, created_at").eq("id", studentResult.data.registration_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const [label, result] of [["Student enrolments", enrollments], ["Course enrolments", courseEnrollments], ["Student notes", notes], ["Student audit history", audits], ["Registration source", registration]] as const) throwQueryError(label, result.error);
  return { student: studentResult.data, enrollments: enrollments.data ?? [], courseEnrollments: courseEnrollments.data ?? [], notes: notes.data ?? [], audits: audits.data ?? [], registration: registration.data };
}

export type AdminCohortListItem = Cohort & { student_count: number; course_count: number };

export async function fetchAdminCohorts(supabase: SupabaseClient) {
  const result = await supabase.from("cohorts").select("*, student_enrollments(id), cohort_courses(id)").order("start_date", { ascending: false, nullsFirst: false });
  throwQueryError("Cohorts", result.error);
  return (result.data ?? []).map((row) => {
    const value = row as unknown as Cohort & { student_enrollments: { id: string }[]; cohort_courses: { id: string }[] };
    return { ...value, student_count: value.student_enrollments?.length ?? 0, course_count: value.cohort_courses?.length ?? 0 } as AdminCohortListItem;
  });
}

export async function fetchAdminCohort(supabase: SupabaseClient, id: string) {
  const [cohort, offerings, sessions] = await Promise.all([
    supabase.from("cohorts").select("*").eq("id", id).maybeSingle(),
    supabase.from("cohort_courses").select("*, courses(*), facilitator_course_assignments(*, facilitators(id, display_name, title, facilitator_status))").eq("cohort_id", id).order("created_at"),
    supabase.from("class_sessions").select("id, title, session_number, session_type, delivery_mode, scheduled_start_at, session_status, facilitator_id, facilitators(id, display_name), cohort_courses!inner(cohort_id, courses(id, code, title))").eq("cohort_courses.cohort_id", id).order("scheduled_start_at", { ascending: true, nullsFirst: false }),
  ]);
  throwQueryError("Cohort", cohort.error);
  throwQueryError("Cohort courses", offerings.error);
  throwQueryError("Cohort sessions", sessions.error);
  if (!cohort.data) throw new LmsAdminDataError("Cohort not found.", 404);
  const count = await supabase.from("student_enrollments").select("id", { count: "exact", head: true }).eq("cohort_id", id);
  throwQueryError("Cohort student count", count.error);
  return { cohort: cohort.data, offerings: offerings.data ?? [], studentCount: count.count ?? 0, sessions: sessions.data ?? [] };
}

export async function fetchAdminCourses(supabase: SupabaseClient) {
  const result = await supabase.from("courses").select("*, cohort_courses(id, course_enrollments(id))").order("course_category").order("sequence_number", { ascending: true, nullsFirst: false });
  throwQueryError("Courses", result.error);
  return (result.data ?? []).map((row) => {
    const value = row as unknown as Course & { cohort_courses: Array<{ id: string; course_enrollments: { id: string }[] }> };
    return { ...value, offering_count: value.cohort_courses?.length ?? 0, enrollment_count: (value.cohort_courses ?? []).reduce((sum, item) => sum + (item.course_enrollments?.length ?? 0), 0) };
  });
}

export async function fetchAdminCourse(supabase: SupabaseClient, id: string) {
  const [course, offerings, sessions] = await Promise.all([
    supabase.from("courses").select("*").eq("id", id).maybeSingle(),
    supabase.from("cohort_courses").select("*, cohorts(id, code, name, status), course_enrollments(id), facilitator_course_assignments(*, facilitators(id, display_name, title))").eq("course_id", id),
    supabase.from("class_sessions").select("id, title, session_number, session_type, delivery_mode, scheduled_start_at, session_status, facilitator_id, facilitators(id, display_name), cohort_courses!inner(course_id, cohorts(id, code, name))").eq("cohort_courses.course_id", id).order("scheduled_start_at", { ascending: true, nullsFirst: false }),
  ]);
  throwQueryError("Course", course.error);
  throwQueryError("Course offerings", offerings.error);
  throwQueryError("Course sessions", sessions.error);
  if (!course.data) throw new LmsAdminDataError("Course not found.", 404);
  return { course: course.data, offerings: offerings.data ?? [], enrollmentCount: (offerings.data ?? []).reduce((sum, item) => sum + ((item.course_enrollments as unknown as { id: string }[])?.length ?? 0), 0), sessions: sessions.data ?? [] };
}

export async function fetchAdminFacilitators(supabase: SupabaseClient) {
  const result = await supabase.from("facilitators").select("*, facilitator_course_assignments(id)").order("display_name");
  throwQueryError("Facilitators", result.error);
  return (result.data ?? []).map((row) => {
    const value = row as unknown as Facilitator & { facilitator_course_assignments: { id: string }[] };
    return { ...value, assignment_count: value.facilitator_course_assignments?.length ?? 0 };
  });
}

export async function fetchAdminFacilitator(supabase: SupabaseClient, id: string) {
  const [facilitator, assignments, availableOfferings] = await Promise.all([
    supabase.from("facilitators").select("*").eq("id", id).maybeSingle(),
    supabase.from("facilitator_course_assignments").select("*, cohort_courses(*, courses(id, code, title, course_category, discipleship_route, skill_pathway), cohorts(id, code, name))").eq("facilitator_id", id).order("created_at"),
    supabase.from("cohort_courses").select("id, courses(id, code, title, discipleship_route, skill_pathway), cohorts(id, code, name, status)").order("created_at"),
  ]);
  throwQueryError("Facilitator", facilitator.error);
  throwQueryError("Facilitator assignments", assignments.error);
  throwQueryError("Available course offerings", availableOfferings.error);
  if (!facilitator.data) throw new LmsAdminDataError("Facilitator not found.", 404);
  return { facilitator: facilitator.data, assignments: assignments.data ?? [], availableOfferings: availableOfferings.data ?? [] };
}

export async function fetchAdminDashboard(supabase: SupabaseClient) {
  const registrationResult = await supabase.from("registrations").select("application_status, advanced_entry_status, scholarship_status");
  throwQueryError("Applications", registrationResult.error);
  const registrations = registrationResult.data ?? [];
  const counts = await Promise.all([
    supabase.from("students").select("id", { count: "exact", head: true }),
    supabase.from("students").select("id", { count: "exact", head: true }).eq("student_status", "active"),
    supabase.from("students").select("id", { count: "exact", head: true }).neq("onboarding_status", "completed"),
    supabase.from("cohorts").select("id", { count: "exact", head: true }).in("status", ["planned", "admissions_open", "admissions_closed", "active"]),
    supabase.from("courses").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("facilitators").select("id", { count: "exact", head: true }).eq("facilitator_status", "active"),
    supabase.from("student_engagement_alerts").select("id", { count: "exact", head: true }).neq("alert_status", "resolved"),
    supabase.from("student_engagement_alerts").select("id", { count: "exact", head: true }).neq("alert_status", "resolved").eq("severity", "high"),
    supabase.from("student_enrollments").select("id", { count: "exact", head: true }).eq("standing_review_required", true),
    supabase.from("mentor_assignments").select("id", { count: "exact", head: true }).eq("assignment_status", "active"),
    supabase.from("student_recovery_plans").select("id", { count: "exact", head: true }).eq("plan_status", "active"),
    supabase.from("student_status_review_cases").select("id", { count: "exact", head: true }).neq("case_status", "closed"),
  ]);
  counts.forEach((result) => throwQueryError("Dashboard count", result.error));
  const [provisioned, activeStudents, pendingOnboarding, currentCohorts, currentCourses, facilitators, openEngagementAlerts, highSeverityAlerts, standingReviewsRequired, activeMentorAssignments, activeRecoveryPlans, openStudentReviews] = counts.map((result) => result.count ?? 0);
  return {
    applications: registrations.length,
    pending: registrations.filter((item) => item.application_status === "pending_review").length,
    admitted: registrations.filter((item) => item.application_status === "admitted").length,
    provisioned,
    activeStudents,
    pendingOnboarding,
    currentCohorts,
    currentCourses,
    facilitators,
    pendingAlumniVerification: registrations.filter((item) => item.advanced_entry_status === "pending_alumni_verification").length,
    pendingScreeningReviews: registrations.filter((item) => item.advanced_entry_status === "pending_screening_review").length,
    pendingScholarshipRequests: registrations.filter((item) => item.scholarship_status === "pending").length,
    openEngagementAlerts,
    highSeverityAlerts,
    standingReviewsRequired,
    activeMentorAssignments,
    activeRecoveryPlans,
    openStudentReviews,
  };
}
