import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { createStudentAbsenceDownload } from "@/lib/lms/privateStorage.server";
import { requireStudentAbsenceApi } from "@/lib/lms/studentAbsenceApi";

export async function GET(_request: Request, { params }: { params: Promise<{ evidenceId: string }> }) {
  const { evidenceId } = await params;
  if (!isUuid(evidenceId)) return Response.json({ message: "This file is no longer available." }, { status: 404 });
  try {
    const context = await requireStudentAbsenceApi();
    return Response.redirect(await createStudentAbsenceDownload(context.supabase, context.user.id, evidenceId), 302);
  } catch (error) {
    return lmsApiError(error, "You do not have permission to access this file.");
  }
}

