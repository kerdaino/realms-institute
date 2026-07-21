import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const currentStudentEnrollmentStatuses = ["pending_onboarding", "active", "enrolled", "matriculated"] as const;

type EnrollmentQueryResult<T> = {
  data: T | null;
  error: { code?: string; message: string } | null;
};

/**
 * Prefer the newest active enrolment, while retaining access to the newest
 * historical enrolment when a student is between active programmes.
 */
export async function selectCurrentStudentEnrollment<T>(
  supabase: SupabaseClient,
  studentId: string,
  columns: string,
): Promise<EnrollmentQueryResult<T>> {
  const active = await supabase
    .from("student_enrollments")
    .select(columns)
    .eq("student_id", studentId)
    .in("enrolment_status", [...currentStudentEnrollmentStatuses])
    .order("enrolled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (active.error || active.data) return active as unknown as EnrollmentQueryResult<T>;

  const historical = await supabase
    .from("student_enrollments")
    .select(columns)
    .eq("student_id", studentId)
    .order("enrolled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return historical as unknown as EnrollmentQueryResult<T>;
}
