import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { reconcileZoomViewerEvidence } from "@/lib/lms/zoomEvidenceService";

export async function POST(request: Request) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const body = await readJsonObject(request); if (!body || typeof body.recording_id !== "string" || !isUuid(body.recording_id)) return NextResponse.json({ message: "Choose a valid Zoom recording." }, { status: 400 }); try { return NextResponse.json(await reconcileZoomViewerEvidence(requireLmsAdminClient(), body.recording_id, { actorLabel: "REALMS Admin" })); } catch (error) { return lmsApiError(error, "Zoom viewing evidence could not be reconciled."); } }
