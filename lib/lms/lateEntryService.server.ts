import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureMakeupRequirement } from "@/lib/lms/absenceService";
import { LmsAdminDataError } from "@/lib/lms/adminData";
import { lateEntryCatchupDeadline, lateEntryCatchupDisplayStatus, missedRequiredLateEntrySessions } from "@/lib/lms/lateEntry";

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function relation(value: unknown) { return Array.isArray(value) ? object(value[0]) : object(value); }

export type LateEntryCatchupPlanResult = {
  effectiveEnrolledAt: string;
  deadline: string;
  required: number;
  created: number;
  materialsAssigned: number;
  alternativeRequired: number;
};

export async function ensureLateEntryCatchupPlan(
  supabase: SupabaseClient,
  input: { studentEnrollmentId: string; actorUserId?: string | null },
): Promise<LateEntryCatchupPlanResult> {
  const enrollmentResult = await supabase.from("student_enrollments").select("id, enrolled_at").eq("id", input.studentEnrollmentId).maybeSingle();
  if (enrollmentResult.error || !enrollmentResult.data) throw new LmsAdminDataError("The effective student enrolment could not be loaded.");
  const effectiveEnrolledAt = enrollmentResult.data.enrolled_at;
  if (typeof effectiveEnrolledAt !== "string" || Number.isNaN(Date.parse(effectiveEnrolledAt))) throw new LmsAdminDataError("A valid effective enrolment timestamp is required before catch-up can be prepared.", 409);

  const courseResult = await supabase.from("course_enrollments").select("id, cohort_course_id").eq("student_enrollment_id", input.studentEnrollmentId).in("enrollment_status", ["active", "enrolled"]);
  if (courseResult.error) throw new LmsAdminDataError("The student's active course enrolments could not be loaded.");
  const courseByOffering = new Map((courseResult.data ?? []).map((row) => [row.cohort_course_id, row.id]));
  const offeringIds = [...courseByOffering.keys()];
  const deadline = lateEntryCatchupDeadline(effectiveEnrolledAt);
  if (!offeringIds.length) return { effectiveEnrolledAt, deadline, required: 0, created: 0, materialsAssigned: 0, alternativeRequired: 0 };

  const sessionResult = await supabase.from("class_sessions").select("id, cohort_course_id, is_required, session_status, scheduled_start_at, scheduled_end_at").in("cohort_course_id", offeringIds);
  if (sessionResult.error) throw new LmsAdminDataError("Required class sessions could not be checked for late-entry catch-up.");
  const missed = missedRequiredLateEntrySessions(sessionResult.data ?? [], new Set(offeringIds), effectiveEnrolledAt);
  let created = 0; let materialsAssigned = 0; let alternativeRequired = 0;
  for (const session of missed) {
    const courseEnrollmentId = courseByOffering.get(session.cohort_course_id);
    if (!courseEnrollmentId) continue;
    const result = await ensureMakeupRequirement(supabase, {
      courseEnrollmentId,
      sessionId: session.id,
      purpose: "LE-C",
      instructions: "Complete the approved late-entry learning for this required session. Use the recording, class summary, resources, and linked assessment shown in your Catch-Up Plan. If no approved recording or practical evidence is available, wait for an authorised alternative activity.",
      dueAt: deadline,
      actor: { actorLabel: "System", actorUserId: input.actorUserId },
    });
    if (result.created) created += 1;
    if (result.materialsAssigned) materialsAssigned += 1;
    if (result.makeup.makeup_status === "alternative_required") alternativeRequired += 1;
  }
  return { effectiveEnrolledAt, deadline, required: missed.length, created, materialsAssigned, alternativeRequired };
}

export type StudentLateEntryCatchup = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  sessionDate: string | null;
  courseCode: string;
  courseTitle: string;
  instructions: string;
  dueAt: string | null;
  status: string;
  rawStatus: string;
  recordingAssignmentId: string | null;
  quizId: string | null;
  practicalAssignmentId: string | null;
  reflectionAssignmentId: string | null;
  hasPublishedSummary: boolean;
  hasResources: boolean;
};

export async function fetchStudentLateEntryCatchup(supabase: SupabaseClient, profileId: string): Promise<StudentLateEntryCatchup[]> {
  const student = await supabase.from("students").select("id").eq("profile_id", profileId).maybeSingle();
  if (student.error || !student.data) throw new LmsAdminDataError("Student access required.", 403);
  const courseEnrollments = await supabase.from("course_enrollments").select("id, student_enrollments!inner(student_id)").eq("student_enrollments.student_id", student.data.id).in("enrollment_status", ["active", "enrolled"]);
  if (courseEnrollments.error) throw new LmsAdminDataError("Your active course enrolments could not be resolved.");
  const ids = (courseEnrollments.data ?? []).map((row) => row.id);
  if (!ids.length) return [];
  const result = await supabase.from("makeup_requirements").select("id, course_enrollment_id, makeup_status, instructions, due_at, recording_learning_assignment_id, linked_quiz_id, linked_practical_assignment_id, linked_reflection_assignment_id, class_sessions(id, title, scheduled_start_at, cohort_courses(courses(code, title)), class_summaries(id, summary_status), session_resources(id, is_active, access_level))").eq("purpose_code", "LE-C").in("course_enrollment_id", ids).order("due_at", { ascending: true, nullsFirst: false });
  if (result.error) throw new LmsAdminDataError("Your Catch-Up Plan could not be loaded.");
  const linkedAssignmentIds = [...new Set((result.data ?? []).flatMap((row) => [row.linked_practical_assignment_id, row.linked_reflection_assignment_id]).filter((id): id is string => typeof id === "string"))];
  const submissions = linkedAssignmentIds.length ? await supabase.from("assignment_submissions").select("assignment_id, course_enrollment_id, submission_status").in("assignment_id", linkedAssignmentIds).in("course_enrollment_id", ids) : { data: [], error: null };
  if (submissions.error) throw new LmsAdminDataError("Submitted catch-up evidence could not be checked.");
  const submittedKeys = new Set((submissions.data ?? []).filter((row) => ["submitted", "under_review", "under_integrity_review", "graded"].includes(row.submission_status)).map((row) => `${row.course_enrollment_id}:${row.assignment_id}`));
  return (result.data ?? []).map((row) => {
    const session = relation(row.class_sessions); const course = relation(relation(session.cohort_courses).courses);
    const summaries = Array.isArray(session.class_summaries) ? session.class_summaries.map(object) : [];
    const resources = Array.isArray(session.session_resources) ? session.session_resources.map(object) : [];
    return {
      id: row.id,
      sessionId: String(session.id),
      sessionTitle: String(session.title ?? "Required session"),
      sessionDate: typeof session.scheduled_start_at === "string" ? session.scheduled_start_at : null,
      courseCode: String(course.code ?? "Course"),
      courseTitle: String(course.title ?? "Course"),
      instructions: String(row.instructions ?? "Complete the approved catch-up activity."),
      dueAt: row.due_at,
      status: lateEntryCatchupDisplayStatus({ ...row, evidenceSubmitted: [row.linked_practical_assignment_id, row.linked_reflection_assignment_id].some((id) => typeof id === "string" && submittedKeys.has(`${row.course_enrollment_id}:${id}`)) }),
      rawStatus: row.makeup_status,
      recordingAssignmentId: row.recording_learning_assignment_id,
      quizId: row.linked_quiz_id,
      practicalAssignmentId: row.linked_practical_assignment_id,
      reflectionAssignmentId: row.linked_reflection_assignment_id,
      hasPublishedSummary: summaries.some((item) => item.summary_status === "published"),
      hasResources: resources.some((item) => item.is_active && item.access_level === "enrolled_students"),
    };
  });
}
