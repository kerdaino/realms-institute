import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { correctFinalizedAttendance } from "@/lib/lms/attendanceService";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params; const body = await readJsonObject(request);
  if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid correction is required." }, { status: 400 });
  try { return NextResponse.json({ attendance: await correctFinalizedAttendance(requireLmsAdminClient(), id, body, { actorLabel: "REALMS Admin" }) }); }
  catch (error) { return lmsApiError(error, "Attendance correction could not be saved."); }
}
