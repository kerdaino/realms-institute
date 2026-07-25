import { isUuid } from "@/lib/lms/adminConstants";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { requireFacilitatorSessionAccess, resolveFacilitatorSessionContext } from "@/lib/lms/facilitatorSessions";
import { createManagedLearningResourceDownload, loadManagedLearningResourceFile } from "@/lib/lms/learningResourceStorage.server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; resourceId: string }> },
) {
  const { id, resourceId } = await params;
  if (!isUuid(id) || !isUuid(resourceId)) {
    return Response.json({ message: "This learning material is no longer available." }, { status: 404 });
  }
  try {
    const context = await resolveFacilitatorSessionContext();
    const admin = requireLmsAdminClient();
    const resource = await loadManagedLearningResourceFile(admin, resourceId);
    if (resource.class_session_id !== id) throw new LmsAdminDataError("This learning material is no longer available.", 404);
    await requireFacilitatorSessionAccess(context, resource.class_session_id);
    return Response.redirect(await createManagedLearningResourceDownload(admin, resourceId), 302);
  } catch (error) {
    return lmsApiError(error, "You do not have permission to access this learning material.");
  }
}
