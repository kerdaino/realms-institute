import { NextResponse } from "next/server";

import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { requireFacilitatorSessionAccess, resolveFacilitatorSessionContext } from "@/lib/lms/facilitatorSessions";
import { transitionClassSummary } from "@/lib/lms/sessionService";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, body] = await Promise.all([params, readJsonObject(request)]);
  if (!isUuid(id) || !body || typeof body.summary_id !== "string" || !isUuid(body.summary_id)) return NextResponse.json({ message: "A current summary revision is required." }, { status: 400 });
  try {
    const context = await resolveFacilitatorSessionContext();
    await requireFacilitatorSessionAccess(context, id);
    const current = await context.supabase.from("class_summaries").select("id").eq("id", body.summary_id).eq("class_session_id", id).maybeSingle();
    if (current.error || !current.data) return NextResponse.json({ message: "Class summary not found." }, { status: 404 });
    const summary = await transitionClassSummary(context.supabase, body.summary_id, "submit", body, { actorLabel: "Facilitator", actorUserId: context.userId, auditClient: requireLmsAdminClient() });
    return NextResponse.json({ summary });
  } catch (error) { return lmsApiError(error, "Class summary could not be submitted for review."); }
}
