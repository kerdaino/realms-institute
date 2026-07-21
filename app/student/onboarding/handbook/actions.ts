"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
import { requireRole } from "@/lib/lms/auth";
import { loadStudentHandbookState } from "@/lib/lms/studentHandbook";

export type HandbookAcknowledgementActionState = {
  status: "idle" | "error";
  message: string;
};

export async function acknowledgeRequiredStudentHandbook(
  _previous: HandbookAcknowledgementActionState,
  formData: FormData,
): Promise<HandbookAcknowledgementActionState> {
  if (formData.get("handbook_acknowledgement") !== "confirmed") {
    return { status: "error", message: "Confirm that you have read and understood the handbook before continuing." };
  }

  try {
    const { user } = await requireRole("student");
    const supabase = requireLmsAdminClient();
    const state = await loadStudentHandbookState(supabase, user.id);
    if (!state.studentId || !state.studentEnrollmentId || !state.cohortId) throw new LmsAdminDataError("Your student enrolment is not ready for handbook acknowledgement.", 409);
    if (!state.requiredDocument) throw new LmsAdminDataError("No handbook acknowledgement is currently required for your cohort.", 409);
    if (!state.storageAvailable) throw new LmsAdminDataError("Handbook acknowledgement setup is not available yet. Please contact REALMS Institute.", 503);

    if (!state.acknowledgement) {
      const document = state.requiredDocument;
      const inserted = await supabase.from("student_document_acknowledgements").insert({
        student_id: state.studentId,
        document_type: document.documentType,
        document_version: document.version,
        document_title: document.title,
        effective_cohort_id: state.cohortId,
        acknowledgement_text_snapshot: document.acknowledgementText,
      }).select("id").single();

      if (inserted.error && inserted.error.code !== "23505") throw new LmsAdminDataError("Your handbook acknowledgement could not be recorded.");
      if (inserted.data) {
        await recordLmsAudit(supabase, {
          action: "student_handbook_acknowledged",
          entityType: "student_document_acknowledgement",
          entityId: inserted.data.id,
          actorUserId: user.id,
          metadata: { student_id: state.studentId, cohort_id: state.cohortId, document_type: document.documentType, document_version: document.version },
        });
      }
    }
  } catch (error) {
    if (error instanceof LmsAdminDataError) return { status: "error", message: error.message };
    console.error("Student handbook acknowledgement failed", error instanceof Error ? { name: error.name, message: error.message } : { name: "UnknownError" });
    return { status: "error", message: "Your handbook acknowledgement could not be recorded right now. Please try again or contact REALMS Institute." };
  }

  revalidatePath("/student", "layout");
  redirect("/student");
}
