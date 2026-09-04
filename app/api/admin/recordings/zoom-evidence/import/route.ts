import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { importZoomViewerEvidence } from "@/lib/lms/zoomEvidenceService";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    const form = await request.formData(); const recordingId = form.get("recording_id"); const file = form.get("evidence_csv");
    if (typeof recordingId !== "string" || !isUuid(recordingId) || !(file instanceof File) || file.type && !["text/csv", "application/vnd.ms-excel", "text/plain"].includes(file.type)) return NextResponse.json({ message: "Choose a Zoom recording and a valid CSV evidence file." }, { status: 400 });
    if (file.size > 1_000_000) return NextResponse.json({ message: "Zoom evidence CSV files must be 1 MB or smaller." }, { status: 413 });
    return NextResponse.json(await importZoomViewerEvidence(requireLmsAdminClient(), recordingId, await file.text(), { actorLabel: "REALMS Admin" }), { status: 201 });
  } catch (error) { return lmsApiError(error, "Zoom viewing evidence could not be imported."); }
}
