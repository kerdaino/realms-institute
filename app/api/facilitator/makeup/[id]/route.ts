import { NextResponse } from "next/server";
import { fetchFacilitatorMakeup } from "@/lib/lms/absenceData";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { resolveFacilitatorAssessmentContext } from "@/lib/lms/facilitatorAssessments";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; if (!isUuid(id)) return NextResponse.json({ message: "A valid make-up requirement is required." }, { status: 400 }); try { const context = await resolveFacilitatorAssessmentContext(); const rows = await fetchFacilitatorMakeup(context.supabase, context.offeringIds); const item = rows.find((row) => row.id === id); return item ? NextResponse.json({ makeup: item }) : NextResponse.json({ message: "Make-up requirement not found." }, { status: 404 }); } catch (error) { return lmsApiError(error, "Assigned make-up requirement could not be loaded."); } }
