import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { createRecordingCheckpoint } from "@/lib/lms/recordingService";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const body = await readJsonObject(request); if (!body) return NextResponse.json({ message: "Valid checkpoint details are required." }, { status: 400 }); const { id } = await params; try { return NextResponse.json({ checkpoint: await createRecordingCheckpoint(requireLmsAdminClient(), id, body, { actorLabel: "REALMS Admin" }) }, { status: 201 }); } catch (error) { return lmsApiError(error, "Recording checkpoint could not be created."); } }
