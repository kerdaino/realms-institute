import { NextResponse } from "next/server";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { submitRecordingCheckpointAnswer } from "@/lib/lms/recordingService";
import { recordStudentMeaningfulActivity } from "@/lib/lms/engagementService";
import { requireStudentRecordingApi } from "@/lib/lms/studentRecordingApi";

export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string; checkpointId: string }> }) {
  try { const body = await readJsonObject(request); if (!body) return NextResponse.json({ message: "A checkpoint response is required." }, { status: 400 }); const { user, supabase } = await requireStudentRecordingApi(); const { assignmentId, checkpointId } = await params; const result = await submitRecordingCheckpointAnswer(supabase, user.id, assignmentId, checkpointId, body); await recordStudentMeaningfulActivity(supabase, user.id); return NextResponse.json(result); }
  catch (error) { return lmsApiError(error, "Checkpoint response could not be saved."); }
}
