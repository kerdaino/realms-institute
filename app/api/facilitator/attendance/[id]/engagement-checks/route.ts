import { NextResponse } from "next/server";
import { isUuid } from "@/lib/lms/adminConstants";
import { addAttendanceEngagementCheck } from "@/lib/lms/attendanceService";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
import { requireFacilitatorSessionAccess, resolveFacilitatorSessionContext } from "@/lib/lms/facilitatorSessions";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const body = await readJsonObject(request);
  if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid engagement check is required." }, { status: 400 });
  try { const context = await resolveFacilitatorSessionContext(); const admin = requireLmsAdminClient(); const record = await admin.from("session_attendance").select("class_session_id").eq("id", id).maybeSingle(); if (record.error || !record.data) throw new LmsAdminDataError("Attendance record not found.", 404); await requireFacilitatorSessionAccess(context, record.data.class_session_id); return NextResponse.json({ check: await addAttendanceEngagementCheck(admin, id, body, { actorLabel: "Facilitator", actorUserId: context.userId, auditClient: admin }) }); }
  catch (error) { return lmsApiError(error, "Engagement check could not be saved."); }
}
