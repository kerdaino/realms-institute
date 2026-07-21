import "server-only";

import type { Cohort, Facilitator, Student, StudentEnrollment } from "@/lib/lms/types";
import { selectCurrentStudentEnrollment } from "@/lib/lms/currentEnrollment";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StudentPortalRecord = {
  student: Pick<Student, "id" | "student_number" | "legal_name" | "preferred_name" | "student_status">;
  enrollment: Pick<StudentEnrollment, "discipleship_route" | "skill_pathway" | "skill_learning_mode" | "enrolment_status"> | null;
  cohort: Pick<Cohort, "code" | "name"> | null;
};

export async function getOwnStudentPortalRecord(profileId: string): Promise<StudentPortalRecord | null> {
  const supabase = await createSupabaseServerClient();
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, student_number, legal_name, preferred_name, student_status")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (studentError) {
    console.error("Student portal record lookup failed", { code: studentError.code });
    return null;
  }
  if (!student) return null;

  const { data: enrollment, error: enrollmentError } = await selectCurrentStudentEnrollment<{ cohort_id: string; discipleship_route: string; skill_pathway: string; skill_learning_mode: string; enrolment_status: string }>(
    supabase,
    student.id,
    "cohort_id, discipleship_route, skill_pathway, skill_learning_mode, enrolment_status",
  );
  if (enrollmentError) console.error("Student enrollment lookup failed", { code: enrollmentError.code });

  let cohort: Pick<Cohort, "code" | "name"> | null = null;
  if (enrollment?.cohort_id) {
    const result = await supabase.from("cohorts").select("code, name").eq("id", enrollment.cohort_id).maybeSingle();
    if (result.error) console.error("Student cohort lookup failed", { code: result.error.code });
    cohort = result.data as Pick<Cohort, "code" | "name"> | null;
  }

  return {
    student: student as StudentPortalRecord["student"],
    enrollment: enrollment as StudentPortalRecord["enrollment"],
    cohort,
  };
}

export async function getOwnFacilitatorSummary(profileId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("facilitators")
    .select("id, display_name, email, active")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) {
    console.error("Facilitator profile lookup failed", { code: error.code });
    return null;
  }
  if (!data) return null;

  const assignmentResult = await supabase
    .from("facilitator_course_assignments")
    .select("id", { count: "exact", head: true })
    .eq("facilitator_id", data.id);
  if (assignmentResult.error) console.error("Facilitator assignment count failed", { code: assignmentResult.error.code });

  return {
    facilitator: data as Pick<Facilitator, "id" | "display_name" | "email" | "active">,
    assignedCourseCount: assignmentResult.count ?? 0,
  };
}
