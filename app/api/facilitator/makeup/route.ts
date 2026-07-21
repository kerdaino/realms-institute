import { NextResponse } from "next/server";
import { fetchFacilitatorMakeup } from "@/lib/lms/absenceData";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { resolveFacilitatorAssessmentContext } from "@/lib/lms/facilitatorAssessments";
export async function GET() { try { const context = await resolveFacilitatorAssessmentContext(); return NextResponse.json({ makeup: await fetchFacilitatorMakeup(context.supabase, context.offeringIds) }); } catch (error) { return lmsApiError(error, "Assigned make-up requirements could not be loaded."); } }
