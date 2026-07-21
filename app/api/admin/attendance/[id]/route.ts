import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { recordPhysicalRollCall, updateLiveAttendanceEvidence } from "@/lib/lms/attendanceService";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  const body = await readJsonObject(request);
  if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid attendance update is required." }, { status: 400 });
  try {
    const supabase = requireLmsAdminClient();
    const attendance = body.action === "roll_call"
      ? await recordPhysicalRollCall(supabase, id, body, { actorLabel: "REALMS Admin" })
      : await updateLiveAttendanceEvidence(supabase, id, body, { actorLabel: "REALMS Admin" });
    return NextResponse.json({ attendance });
  } catch (error) { return lmsApiError(error, "Attendance could not be updated."); }
}
