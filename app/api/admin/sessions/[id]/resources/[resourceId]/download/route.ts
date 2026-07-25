import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { createManagedLearningResourceDownload, loadManagedLearningResourceFile } from "@/lib/lms/learningResourceStorage.server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; resourceId: string }> },
) {
  const { id, resourceId } = await params;
  if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 });
  if (!isUuid(id) || !isUuid(resourceId)) {
    return Response.json({ message: "This learning material is no longer available." }, { status: 404 });
  }
  try {
    const admin = requireLmsAdminClient();
    const resource = await loadManagedLearningResourceFile(admin, resourceId);
    if (resource.class_session_id !== id) {
      return Response.json({ message: "This learning material is no longer available." }, { status: 404 });
    }
    return Response.redirect(await createManagedLearningResourceDownload(admin, resourceId), 302);
  } catch (error) {
    return lmsApiError(error, "This learning material could not be opened.");
  }
}
