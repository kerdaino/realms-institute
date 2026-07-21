import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { applyAdminRecordingAction } from "@/lib/lms/recordingService";

export async function PATCH(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const body = await readJsonObject(request); if (!body) return NextResponse.json({ message: "A valid recorded-learning action is required." }, { status: 400 }); const { assignmentId } = await params; try { return NextResponse.json(await applyAdminRecordingAction(requireLmsAdminClient(), assignmentId, body, { actorLabel: "REALMS Admin" })); } catch (error) { return lmsApiError(error, "Recorded-learning evidence could not be updated."); } }
