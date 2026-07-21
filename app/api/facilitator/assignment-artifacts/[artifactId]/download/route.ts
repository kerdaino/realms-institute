import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { resolveFacilitatorAssessmentContext } from "@/lib/lms/facilitatorAssessments";
import { createFacilitatorAssessmentDownload } from "@/lib/lms/privateStorage.server";

export async function GET(_request: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  const { artifactId } = await params;
  if (!isUuid(artifactId)) return Response.json({ message: "This file is no longer available." }, { status: 404 });
  try {
    const context = await resolveFacilitatorAssessmentContext();
    return Response.redirect(await createFacilitatorAssessmentDownload(context.supabase, context.facilitatorId, artifactId), 302);
  } catch (error) {
    return lmsApiError(error, "You do not have permission to access this file.");
  }
}

