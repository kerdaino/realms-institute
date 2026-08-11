import { NextResponse } from "next/server";
import { fetchFacilitatorMakeup } from "@/lib/lms/absenceData";
import { updateMakeupRequirement, verifyExternalMakeupEvidence } from "@/lib/lms/absenceService";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { resolveFacilitatorAssessmentContext } from "@/lib/lms/facilitatorAssessments";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; if (!isUuid(id)) return NextResponse.json({ message: "A valid make-up requirement is required." }, { status: 400 }); try { const context = await resolveFacilitatorAssessmentContext(); const rows = await fetchFacilitatorMakeup(context.supabase, context.offeringIds); const item = rows.find((row) => row.id === id); return item ? NextResponse.json({ makeup: item }) : NextResponse.json({ message: "Make-up requirement not found." }, { status: 404 }); } catch (error) { return lmsApiError(error, "Assigned make-up requirement could not be loaded."); } }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const body = await readJsonObject(request);
  if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid catch-up update is required." }, { status: 400 });
  try {
    const context = await resolveFacilitatorAssessmentContext();
    const rows = await fetchFacilitatorMakeup(context.supabase, context.offeringIds);
    const item = rows.find((row) => row.id === id);
    if (!item || item.purpose_code !== "LE-C") return NextResponse.json({ message: "Assigned late-entry catch-up requirement not found." }, { status: 404 });
    const actor = { actorLabel: "Facilitator" as const, actorUserId: context.userId };
    if (body.action === "verify_alternative") return NextResponse.json(await verifyExternalMakeupEvidence(context.supabase, id, body, actor));
    if (body.action !== "set_alternative") return NextResponse.json({ message: "This facilitator catch-up action is not supported." }, { status: 400 });
    return NextResponse.json(await updateMakeupRequirement(context.supabase, id, body, actor));
  } catch (error) { return lmsApiError(error, "Late-entry catch-up intervention could not be saved."); }
}
