import "server-only";

import { getCurrentUser, getCurrentUserRoles } from "@/lib/lms/auth";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
import { requireMentorCaseload } from "@/lib/lms/engagementData";
import { selectCurrentStudentEnrollment } from "@/lib/lms/currentEnrollment";

export async function requireStudentStandingContext() {
  const user = await getCurrentUser(); if (!user) throw new LmsAdminDataError("Authentication required.", 401);
  if (!(await getCurrentUserRoles()).includes("student")) throw new LmsAdminDataError("Student access required.", 403);
  const supabase = requireLmsAdminClient();
  const student = await supabase.from("students").select("id").eq("profile_id", user.id).maybeSingle();
  if (student.error || !student.data) throw new LmsAdminDataError("Student access required.", 403);
  const enrollment = await selectCurrentStudentEnrollment<{ id: string }>(supabase, student.data.id, "id");
  if (enrollment.error || !enrollment.data) throw new LmsAdminDataError("Student enrolment not found.", 404);
  return { user, supabase, studentEnrollmentId: enrollment.data.id };
}

export async function requireMentorContext(studentEnrollmentId?: string) {
  const user = await getCurrentUser(); if (!user) throw new LmsAdminDataError("Authentication required.", 401);
  if (!(await getCurrentUserRoles()).includes("mentor")) throw new LmsAdminDataError("Mentor access required.", 403);
  const supabase = requireLmsAdminClient();
  const assignments = await requireMentorCaseload(supabase, user.id, studentEnrollmentId);
  return { user, supabase, assignments };
}
