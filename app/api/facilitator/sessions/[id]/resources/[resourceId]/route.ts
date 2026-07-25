import { NextResponse } from "next/server";

import { isUuid } from "@/lib/lms/adminConstants";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { requireFacilitatorSessionAccess, resolveFacilitatorSessionContext } from "@/lib/lms/facilitatorSessions";
import { updateSessionResource } from "@/lib/lms/sessionService";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; resourceId: string }> },
) {
  const { id, resourceId } = await params;
  if (!isUuid(id) || !isUuid(resourceId)) {
    return NextResponse.json({ message: "Learning resource not found." }, { status: 404 });
  }
  try {
    const context = await resolveFacilitatorSessionContext();
    await requireFacilitatorSessionAccess(context, id);
    const admin = requireLmsAdminClient();
    const current = await admin
      .from("session_resources")
      .select("*")
      .eq("id", resourceId)
      .eq("class_session_id", id)
      .maybeSingle();
    if (current.error || !current.data) throw new LmsAdminDataError("Learning resource not found.", 404);
    const resource = await updateSessionResource(admin, resourceId, {
      ...current.data,
      is_active: false,
    }, {
      actorLabel: "Facilitator",
      actorUserId: context.userId,
      auditClient: admin,
    });
    return NextResponse.json({ resource });
  } catch (error) {
    return lmsApiError(error, "The learning resource could not be deactivated.");
  }
}
