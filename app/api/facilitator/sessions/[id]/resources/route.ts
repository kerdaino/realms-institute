import { NextResponse } from "next/server";

import { isUuid } from "@/lib/lms/adminConstants";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireFacilitatorSessionAccess, resolveFacilitatorSessionContext } from "@/lib/lms/facilitatorSessions";
import { addExternalLearningResource, storeLearningResourceUpload } from "@/lib/lms/learningResourceStorage.server";
import { privateFileLimits } from "@/lib/lms/privateFilePolicy";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ message: "Class session not found." }, { status: 404 });
  try {
    const context = await resolveFacilitatorSessionContext();
    await requireFacilitatorSessionAccess(context, id);
    const admin = requireLmsAdminClient();
    const actor = { actorLabel: "Facilitator" as const, actorUserId: context.userId, auditClient: admin };

    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > privateFileLimits.learningResource + 256 * 1024) {
        throw new LmsAdminDataError("Learning materials must be 4 MB or smaller.", 413);
      }
      const form = await request.formData();
      const candidate = form.get("attachment");
      if (!(candidate instanceof File) || candidate.size <= 0) {
        throw new LmsAdminDataError("Choose a learning-material file.", 400);
      }
      const resource = await storeLearningResourceUpload(admin, {
        sessionId: id,
        title: form.get("title"),
        description: form.get("description"),
        resourceType: form.get("resource_type"),
        publishNow: form.get("publish_now"),
        file: candidate,
        actor,
      });
      return NextResponse.json({ resource }, { status: 201 });
    }

    const body = await readJsonObject(request);
    if (!body || body.source !== "external_link") {
      throw new LmsAdminDataError("Valid resource details are required.", 400);
    }
    const resource = await addExternalLearningResource(admin, id, body, actor);
    return NextResponse.json({ resource }, { status: 201 });
  } catch (error) {
    return lmsApiError(error, "The learning resource could not be added.");
  }
}
