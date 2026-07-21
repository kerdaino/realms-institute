import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { LmsAdminDataError } from "@/lib/lms/adminData";
import { resolveRequiredStudentHandbook, type StudentHandbookDocument } from "@/lib/lms/handbookConfig";
import { selectCurrentStudentEnrollment } from "@/lib/lms/currentEnrollment";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StudentDocumentAcknowledgement = {
  id: string;
  student_id: string;
  document_type: string;
  document_version: string;
  document_title: string;
  effective_cohort_id: string;
  acknowledgement_text_snapshot: string;
  acknowledged_at: string;
  created_at: string;
};

export type StudentHandbookState = {
  studentId: string | null;
  studentEnrollmentId: string | null;
  cohortId: string | null;
  cohortCode: string | null;
  requiredDocument: StudentHandbookDocument | null;
  acknowledgement: StudentDocumentAcknowledgement | null;
  acknowledged: boolean;
  storageAvailable: boolean;
};

type QueryError = { code?: string; message?: string } | null;

export class StudentHandbookDataError extends LmsAdminDataError {
  constructor(message = "Your handbook acknowledgement status could not be loaded right now.", status = 500) {
    super(message, status);
    this.name = "StudentHandbookDataError";
  }
}

function fail(label: string, error: QueryError) {
  if (!error) return;
  console.error(`Student handbook ${label} failed`, { code: error.code, message: error.message });
  throw new StudentHandbookDataError();
}

export async function loadStudentHandbookState(supabase: SupabaseClient, profileId: string): Promise<StudentHandbookState> {
  const student = await supabase.from("students").select("id").eq("profile_id", profileId).maybeSingle();
  fail("student lookup", student.error);
  if (!student.data) return { studentId: null, studentEnrollmentId: null, cohortId: null, cohortCode: null, requiredDocument: null, acknowledgement: null, acknowledged: true, storageAvailable: true };

  const enrollment = await selectCurrentStudentEnrollment<{ id: string; cohort_id: string }>(supabase, student.data.id, "id, cohort_id");
  fail("current enrollment lookup", enrollment.error);
  if (!enrollment.data) return { studentId: student.data.id, studentEnrollmentId: null, cohortId: null, cohortCode: null, requiredDocument: null, acknowledgement: null, acknowledged: true, storageAvailable: true };

  const cohort = await supabase.from("cohorts").select("id, code").eq("id", enrollment.data.cohort_id).maybeSingle();
  fail("cohort lookup", cohort.error);
  const cohortCode = cohort.data?.code ?? null;
  const requiredDocument = resolveRequiredStudentHandbook(cohortCode);
  if (!requiredDocument) return { studentId: student.data.id, studentEnrollmentId: enrollment.data.id, cohortId: enrollment.data.cohort_id, cohortCode, requiredDocument: null, acknowledgement: null, acknowledged: true, storageAvailable: true };

  const acknowledgement = await supabase
    .from("student_document_acknowledgements")
    .select("id, student_id, document_type, document_version, document_title, effective_cohort_id, acknowledgement_text_snapshot, acknowledged_at, created_at")
    .eq("student_id", student.data.id)
    .eq("document_type", requiredDocument.documentType)
    .eq("document_version", requiredDocument.version)
    .maybeSingle();

  if (acknowledgement.error?.code === "PGRST205" || acknowledgement.error?.code === "42P01") {
    return { studentId: student.data.id, studentEnrollmentId: enrollment.data.id, cohortId: enrollment.data.cohort_id, cohortCode, requiredDocument, acknowledgement: null, acknowledged: false, storageAvailable: false };
  }
  fail("acknowledgement lookup", acknowledgement.error);
  return {
    studentId: student.data.id,
    studentEnrollmentId: enrollment.data.id,
    cohortId: enrollment.data.cohort_id,
    cohortCode,
    requiredDocument,
    acknowledgement: acknowledgement.data as StudentDocumentAcknowledgement | null,
    acknowledged: Boolean(acknowledgement.data),
    storageAvailable: true,
  };
}

export const getStudentHandbookState = cache(async (profileId: string) => loadStudentHandbookState(await createSupabaseServerClient(), profileId));

export async function assertStudentHandbookAcknowledged(profileId: string, supabase?: SupabaseClient) {
  const state = supabase ? await loadStudentHandbookState(supabase, profileId) : await getStudentHandbookState(profileId);
  if (!state.requiredDocument || state.acknowledged) return state;
  if (!state.storageAvailable) throw new StudentHandbookDataError("Handbook acknowledgement setup is not available yet. Please contact REALMS Institute.", 503);
  throw new StudentHandbookDataError("Please acknowledge the current Student Handbook before opening academic learning areas.", 428);
}
