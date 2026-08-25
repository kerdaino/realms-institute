import { NextResponse } from "next/server";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { requireFacilitatorSessionAccess, resolveFacilitatorSessionContext } from "@/lib/lms/facilitatorSessions";
import { saveClassSummary } from "@/lib/lms/sessionService";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJsonObject(request);
  if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid summary draft is required." }, { status: 400 });
  try {
    const context = await resolveFacilitatorSessionContext();
    await requireFacilitatorSessionAccess(context, id);
    return NextResponse.json(await saveClassSummary(context.supabase, id, body, { actorLabel: "Facilitator", actorUserId: context.userId, auditClient: requireLmsAdminClient() }));
  } catch (error) {
    return lmsApiError(error, "Class summary draft could not be saved.");
  }
}
export const PATCH = POST;
