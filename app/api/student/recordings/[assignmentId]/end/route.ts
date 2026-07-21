import { NextResponse } from "next/server";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { endRecordingPlayback } from "@/lib/lms/recordingService";
import { recordStudentMeaningfulActivity } from "@/lib/lms/engagementService";
import { requireStudentRecordingApi } from "@/lib/lms/studentRecordingApi";

export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  try { const body = await readJsonObject(request); if (!body || typeof body.playback_session_id !== "string") return NextResponse.json({ message: "A valid playback session is required." }, { status: 400 }); const { user, supabase } = await requireStudentRecordingApi(); const { assignmentId } = await params; const result = await endRecordingPlayback(supabase, user.id, assignmentId, body.playback_session_id); await recordStudentMeaningfulActivity(supabase, user.id); return NextResponse.json(result); }
  catch (error) { return lmsApiError(error, "Recording playback could not be ended."); }
}
