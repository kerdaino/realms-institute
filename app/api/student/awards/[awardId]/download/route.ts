import { isUuid } from "@/lib/lms/adminConstants";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { createOwnAwardDownloadUrl } from "@/lib/lms/awardService";
import { resolveStudentAssessmentApiContext } from "@/lib/lms/studentAssessmentApi";

export async function POST(_request: Request, { params }: { params: Promise<{ awardId: string }> }) {
  const { awardId } = await params;
  if (!isUuid(awardId)) return Response.json({ message: "This certificate is not available for download." }, { status: 404 });
  try {
    const { user } = await resolveStudentAssessmentApiContext();
    return Response.json({ url: await createOwnAwardDownloadUrl(requireLmsAdminClient(), awardId, user.id) });
  } catch (error) {
    return lmsApiError(error, "A secure certificate download could not be prepared.");
  }
}
