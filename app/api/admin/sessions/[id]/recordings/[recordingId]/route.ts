import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { updateClassRecording } from "@/lib/lms/sessionService";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; recordingId: string }> }) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const { id, recordingId } = await params; const body = await readJsonObject(request); if (!isUuid(id) || !isUuid(recordingId) || !body) return NextResponse.json({ message: "Valid recording metadata is required." }, { status: 400 }); try { return NextResponse.json({ recording: await updateClassRecording(requireLmsAdminClient(), id, recordingId, body, { actorLabel: "REALMS Admin" }) }); } catch (error) { return lmsApiError(error, "Recording metadata could not be updated."); } }
