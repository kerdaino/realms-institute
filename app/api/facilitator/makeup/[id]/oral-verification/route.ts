import { NextResponse } from "next/server";
import { recordMakeupOralVerification } from "@/lib/lms/absenceService";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { resolveFacilitatorAssessmentContext } from "@/lib/lms/facilitatorAssessments";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; const body = await readJsonObject(request); if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid oral-verification update is required." }, { status: 400 }); try { const context = await resolveFacilitatorAssessmentContext(); return NextResponse.json({ makeup: await recordMakeupOralVerification(context.supabase, id, body, { actorLabel: "Facilitator", actorUserId: context.userId }, context.offeringIds) }); } catch (error) { return lmsApiError(error, "Oral verification could not be recorded."); } }
