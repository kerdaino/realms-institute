import { NextResponse } from "next/server";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { recordPlaybackHeartbeat } from "@/lib/lms/recordingService";
import { requireStudentRecordingApi } from "@/lib/lms/studentRecordingApi";

export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  try { const body = await readJsonObject(request); if (!body) return NextResponse.json({ message: "Valid playback evidence is required." }, { status: 400 }); const { user, supabase } = await requireStudentRecordingApi(); const { assignmentId } = await params; return NextResponse.json(await recordPlaybackHeartbeat(supabase, user.id, assignmentId, body)); }
  catch (error) { return lmsApiError(error, "Recording progress could not be saved."); }
}
