import "server-only";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
import { resolveFacilitatorSessionContext } from "@/lib/lms/facilitatorSessions";

export async function resolveFacilitatorAssessmentContext() {
  const identity = await resolveFacilitatorSessionContext(); const supabase = requireLmsAdminClient();
  const assigned = await supabase.from("facilitator_course_assignments").select("cohort_course_id").eq("facilitator_id", identity.facilitatorId);
  if (assigned.error) throw new LmsAdminDataError("Facilitator course assignments could not be loaded.");
  return { ...identity, supabase, offeringIds: (assigned.data ?? []).map((item) => item.cohort_course_id) };
}

export async function requireFacilitatorAssessmentRecord(context: Awaited<ReturnType<typeof resolveFacilitatorAssessmentContext>>, type: "assignment" | "submission" | "quiz" | "answer", id: string) {
  let offeringId: string | null = null;
  if (type === "assignment") { const r = await context.supabase.from("assignments").select("cohort_course_id").eq("id", id).maybeSingle(); offeringId = r.data?.cohort_course_id ?? null; }
  if (type === "submission") { const r = await context.supabase.from("assignment_submissions").select("assignments(cohort_course_id)").eq("id", id).maybeSingle(); const a = Array.isArray(r.data?.assignments) ? r.data.assignments[0] : r.data?.assignments; offeringId = a?.cohort_course_id ?? null; }
  if (type === "quiz") { const r = await context.supabase.from("quizzes").select("cohort_course_id").eq("id", id).maybeSingle(); offeringId = r.data?.cohort_course_id ?? null; }
  if (type === "answer") { const r = await context.supabase.from("quiz_attempt_answers").select("quiz_questions(quizzes(cohort_course_id))").eq("id", id).maybeSingle(); const q = Array.isArray(r.data?.quiz_questions) ? r.data.quiz_questions[0] : r.data?.quiz_questions; const z = Array.isArray(q?.quizzes) ? q.quizzes[0] : q?.quizzes; offeringId = z?.cohort_course_id ?? null; }
  if (!offeringId) throw new LmsAdminDataError("Assessment record not found.", 404);
  if (!context.offeringIds.includes(offeringId)) throw new LmsAdminDataError("You are not assigned to this assessment's cohort course.", 403);
  return offeringId;
}
