import { isUuid } from "@/lib/lms/adminConstants";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { getCurrentUser, getCurrentUserRoles } from "@/lib/lms/auth";
import { createStudentLearningResourceDownload } from "@/lib/lms/learningResourceStorage.server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ resourceId: string }> },
) {
  const { resourceId } = await params;
  if (!isUuid(resourceId)) {
    return Response.json({ message: "This learning material is no longer available." }, { status: 404 });
  }
  try {
    const user = await getCurrentUser();
    if (!user) throw new LmsAdminDataError("Authentication required.", 401);
    if (!(await getCurrentUserRoles()).includes("student")) throw new LmsAdminDataError("Student access required.", 403);
    const url = await createStudentLearningResourceDownload(requireLmsAdminClient(), user.id, resourceId);
    return Response.redirect(url, 302);
  } catch (error) {
    return lmsApiError(error, "You do not have permission to access this learning material.");
  }
}
