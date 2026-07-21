import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { finalizeAttendance } from "@/lib/lms/attendanceService";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params; const body = await readJsonObject(request) ?? {};
  if (!isUuid(id)) return NextResponse.json({ message: "Attendance record not found." }, { status: 404 });
  try { return NextResponse.json({ attendance: await finalizeAttendance(requireLmsAdminClient(), id, body, { actorLabel: "REALMS Admin" }) }); }
  catch (error) { return lmsApiError(error, "Attendance could not be finalized."); }
}
