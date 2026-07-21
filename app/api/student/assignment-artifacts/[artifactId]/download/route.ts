import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { createStudentAssessmentDownload } from "@/lib/lms/privateStorage.server";
import { resolveStudentAssessmentApiContext } from "@/lib/lms/studentAssessmentApi";

export async function GET(_request: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  const { artifactId } = await params;
  if (!isUuid(artifactId)) return Response.json({ message: "This file is no longer available." }, { status: 404 });
  try {
    const context = await resolveStudentAssessmentApiContext();
    return Response.redirect(await createStudentAssessmentDownload(context.supabase, context.user.id, artifactId), 302);
  } catch (error) {
    return lmsApiError(error, "You do not have permission to access this file.");
  }
}

