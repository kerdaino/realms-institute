import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const lifecycleReconciliationReason = "Lifecycle reconciliation — onboarding completed but programme enrolment remained pending_onboarding";

export class ProgrammeEnrollmentLifecycleError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export async function activateProgrammeEnrollment(supabase: SupabaseClient, enrollmentId: string, reason = lifecycleReconciliationReason) {
  const result = await supabase.rpc("activate_programme_enrollment", {
    p_student_enrollment_id: enrollmentId,
    p_reason: reason,
    p_actor_user_id: null,
    p_actor_label: "REALMS Admin",
  });
  if (result.error) throw new ProgrammeEnrollmentLifecycleError(result.error.message);
  return result.data as Record<string, unknown>;
}

export async function synchronizeEligibleProgrammeEnrollments(supabase: SupabaseClient, studentId: string) {
  const pending = await supabase.from("student_enrollments").select("id").eq("student_id", studentId).eq("enrolment_status", "pending_onboarding");
  if (pending.error) throw new ProgrammeEnrollmentLifecycleError("Programme enrolments could not be checked.", 500);
  return Promise.all((pending.data ?? []).map((row) => activateProgrammeEnrollment(supabase, row.id)));
}
