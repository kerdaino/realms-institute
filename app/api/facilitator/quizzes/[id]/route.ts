import { NextResponse } from "next/server";
import { fetchQuizDetail } from "@/lib/lms/assessmentData";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { requireFacilitatorAssessmentRecord, resolveFacilitatorAssessmentContext } from "@/lib/lms/facilitatorAssessments";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; if (!isUuid(id)) return NextResponse.json({ message: "Quiz not found." }, { status: 404 }); try { const context = await resolveFacilitatorAssessmentContext(); await requireFacilitatorAssessmentRecord(context, "quiz", id); return NextResponse.json(await fetchQuizDetail(context.supabase, id, true)); } catch (error) { return lmsApiError(error, "Quiz could not be loaded."); } }
