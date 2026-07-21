import { NextResponse } from "next/server";

import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { getCurrentUser, getCurrentUserRoles } from "@/lib/lms/auth";
import { ensureRevisionAssignmentForRecording } from "@/lib/lms/recordingService";
import { getStudentRecordingTarget, StudentLearningDataError } from "@/lib/lms/studentLearning";

// Legacy recording links share this dynamic segment with Build 7 assignment
// actions. For GET requests the identifier remains a class_recording id.
export async function GET(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Please sign in to access this recording." }, { status: 401 });
  if (!(await getCurrentUserRoles()).includes("student")) return NextResponse.json({ message: "You do not have access to this recording." }, { status: 403 });
  const { assignmentId: recordingId } = await params;
  try {
    const target = await getStudentRecordingTarget(recordingId);
    if (!target) return NextResponse.json({ message: "This recording is not available in your student account." }, { status: 403 });
    const assignment = await ensureRevisionAssignmentForRecording(requireLmsAdminClient(), user.id, recordingId);
    return NextResponse.redirect(new URL(`/student/recordings/${assignment.id}`, request.url));
  } catch (error) {
    if (!(error instanceof StudentLearningDataError)) console.error("Student recording access failed", error instanceof Error ? { name: error.name, message: error.message } : { name: "UnknownError" });
    return NextResponse.json({ message: "The recording could not be opened right now." }, { status: 500 });
  }
}
