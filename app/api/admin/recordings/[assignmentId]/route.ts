import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { applyAdminRecordingAction } from "@/lib/lms/recordingService";
import { reviewZoomViewerEvidence } from "@/lib/lms/zoomEvidenceService";

export async function PATCH(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const body = await readJsonObject(request); if (!body) return NextResponse.json({ message: "A valid recorded-learning action is required." }, { status: 400 }); const { assignmentId } = await params; try { const client = requireLmsAdminClient(); return NextResponse.json(body.action === "review_zoom_evidence" && typeof body.evidence_id === "string" && (body.decision === "verify" || body.decision === "reject") ? await reviewZoomViewerEvidence(client, assignmentId, body.evidence_id, body.decision, typeof body.note === "string" ? body.note : "", { actorLabel: "REALMS Admin" }) : await applyAdminRecordingAction(client, assignmentId, body, { actorLabel: "REALMS Admin" })); } catch (error) { return lmsApiError(error, "Recorded-learning evidence could not be updated."); } }
