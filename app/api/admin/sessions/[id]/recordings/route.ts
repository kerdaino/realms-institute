import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { addClassRecording } from "@/lib/lms/sessionService";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const { id } = await params; const body = await readJsonObject(request); if (!isUuid(id) || !body) return NextResponse.json({ message: "Valid recording metadata is required." }, { status: 400 }); try { return NextResponse.json({ recording: await addClassRecording(requireLmsAdminClient(), id, body, { actorLabel: "REALMS Admin" }) }, { status: 201 }); } catch (error) { return lmsApiError(error, "Recording metadata could not be added."); } }
