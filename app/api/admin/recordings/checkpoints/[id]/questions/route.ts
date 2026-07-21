import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { createCheckpointQuestion } from "@/lib/lms/recordingService";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const body = await readJsonObject(request); if (!body) return NextResponse.json({ message: "Valid question details are required." }, { status: 400 }); const { id } = await params; try { return NextResponse.json({ question: await createCheckpointQuestion(requireLmsAdminClient(), id, body, { actorLabel: "REALMS Admin" }) }, { status: 201 }); } catch (error) { return lmsApiError(error, "Checkpoint question could not be created."); } }
