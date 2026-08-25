import { NextResponse } from "next/server";

import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { resolveFacilitatorSessionContext, saveFacilitatorRecordingSource } from "@/lib/lms/facilitatorSessions";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; recordingId: string }> }) {
  const [{ id, recordingId }, body] = await Promise.all([params, readJsonObject(request)]);
  if (!isUuid(id) || !isUuid(recordingId) || !body) return NextResponse.json({ message: "Valid recording source details are required." }, { status: 400 });
  try {
    const context = await resolveFacilitatorSessionContext();
    return NextResponse.json({ recording: await saveFacilitatorRecordingSource(context, id, body, recordingId) });
  } catch (error) { return lmsApiError(error, "Recording source could not be updated."); }
}
