import { NextResponse } from "next/server";

import { addQuizQuestion } from "@/lib/lms/assessmentService";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireFacilitatorAssessmentRecord, resolveFacilitatorAssessmentContext } from "@/lib/lms/facilitatorAssessments";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, body] = await Promise.all([params, readJsonObject(request)]);
  if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid quiz-question request is required." }, { status: 400 });
  try {
    const context = await resolveFacilitatorAssessmentContext();
    await requireFacilitatorAssessmentRecord(context, "quiz", id);
    return NextResponse.json({ question: await addQuizQuestion(context.supabase, id, body) }, { status: 201 });
  } catch (error) {
    return lmsApiError(error, "Quiz question could not be created.");
  }
}
