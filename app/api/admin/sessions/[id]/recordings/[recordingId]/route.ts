import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { updateClassRecording } from "@/lib/lms/sessionService";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; recordingId: string }> }) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const { id, recordingId } = await params; const body = await readJsonObject(request); if (!isUuid(id) || !isUuid(recordingId) || !body) return NextResponse.json({ message: "Valid recording metadata is required." }, { status: 400 }); try { const recording = await updateClassRecording(requireLmsAdminClient(), recordingId, body, { actorLabel: "REALMS Admin" }); if (recording.class_session_id !== id) return NextResponse.json({ message: "Recording not found." }, { status: 404 }); return NextResponse.json({ recording }); } catch (error) { return lmsApiError(error, "Recording metadata could not be updated."); } }
