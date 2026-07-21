import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { createAdminAssessmentDownload } from "@/lib/lms/privateStorage.server";

export async function GET(_request: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 });
  const { artifactId } = await params;
  if (!isUuid(artifactId)) return Response.json({ message: "This file is no longer available." }, { status: 404 });
  try {
    return Response.redirect(await createAdminAssessmentDownload(requireLmsAdminClient(), artifactId), 302);
  } catch (error) {
    return lmsApiError(error, "This file is no longer available.");
  }
}

