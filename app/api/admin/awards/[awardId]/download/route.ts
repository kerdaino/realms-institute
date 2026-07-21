import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { createAdminAwardDownloadUrl } from "@/lib/lms/awardService";

export async function POST(_request: Request, { params }: { params: Promise<{ awardId: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 });
  const { awardId } = await params;
  if (!isUuid(awardId)) return Response.json({ message: "This file is no longer available." }, { status: 404 });
  try {
    return Response.json({ url: await createAdminAwardDownloadUrl(requireLmsAdminClient(), awardId) });
  } catch (error) {
    return lmsApiError(error, "This file is no longer available.");
  }
}
