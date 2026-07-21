import { NextResponse } from "next/server";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { startRecordingPlayback } from "@/lib/lms/recordingService";
import { recordStudentMeaningfulActivity } from "@/lib/lms/engagementService";
import { requireStudentRecordingApi } from "@/lib/lms/studentRecordingApi";

export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  try { const { user, supabase } = await requireStudentRecordingApi(); const { assignmentId } = await params; const result = await startRecordingPlayback(supabase, user.id, assignmentId, request.headers.get("user-agent")); await recordStudentMeaningfulActivity(supabase, user.id); return NextResponse.json(result); }
  catch (error) { return lmsApiError(error, "Recording playback could not be started."); }
}
