import { NextResponse } from "next/server";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { gradeQuizAnswer } from "@/lib/lms/assessmentService";
import { requireFacilitatorAssessmentRecord, resolveFacilitatorAssessmentContext } from "@/lib/lms/facilitatorAssessments";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid grading request is required." }, { status: 400 }); try { const context = await resolveFacilitatorAssessmentContext(); await requireFacilitatorAssessmentRecord(context, "answer", id); return NextResponse.json({ attempt: await gradeQuizAnswer(context.supabase, id, body, { actorLabel: "Facilitator", actorUserId: context.userId }) }); } catch (error) { return lmsApiError(error, "Quiz answer could not be graded."); } }
