import { NextResponse } from "next/server";

import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { recordQuizAttemptVisibilityEvent } from "@/lib/lms/assessmentService";
import { resolveStudentAssessmentApiContext } from "@/lib/lms/studentAssessmentApi";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, body] = await Promise.all([params, readJsonObject(request)]);
  if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid quiz event is required." }, { status: 400 });
  try {
    const { user, supabase } = await resolveStudentAssessmentApiContext();
    return NextResponse.json(await recordQuizAttemptVisibilityEvent(supabase, user.id, id, body, {
      actorLabel: "Student",
      actorUserId: user.id,
    }));
  } catch (error) {
    return lmsApiError(error, "The quiz event could not be recorded.");
  }
}
