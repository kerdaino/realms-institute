import { NextResponse } from "next/server";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { submitAssignment } from "@/lib/lms/assessmentService";
import { recordStudentMeaningfulActivity } from "@/lib/lms/engagementService";
import { prepareStudentAssessmentUpload, rollbackStudentSubmission, storeStudentAssessmentUpload } from "@/lib/lms/privateStorage.server";
import { resolveStudentAssessmentApiContext } from "@/lib/lms/studentAssessmentApi";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ message: "A valid submission is required." }, { status: 400 });
  try {
    const { user, supabase } = await resolveStudentAssessmentApiContext();
    let body: Record<string, unknown> | null = null; let file: File | null = null;
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData(); body = Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === "string")); const candidate = form.get("attachment"); file = candidate instanceof File && candidate.size > 0 ? candidate : null;
    } else body = await readJsonObject(request);
    if (!body) return NextResponse.json({ message: "A valid submission is required." }, { status: 400 });
    const prepared = file ? await prepareStudentAssessmentUpload(supabase, user.id, id, file) : null;
    const submission = await submitAssignment(supabase, user.id, id, body, { actorLabel: "Student", actorUserId: user.id }, { hasValidatedFile: Boolean(prepared) });
    try {
      const artifact = prepared ? await storeStudentAssessmentUpload(supabase, { profileId: user.id, studentId: prepared.studentId, submissionId: submission.id, upload: prepared.upload }) : null;
      await recordStudentMeaningfulActivity(supabase, user.id);
      return NextResponse.json({ submission, artifact }, { status: 201 });
    } catch (error) {
      await rollbackStudentSubmission(supabase, submission.id);
      throw error;
    }
  } catch (error) {
    return lmsApiError(error, "Your file could not be uploaded. Please check the file type and size and try again.");
  }
}
