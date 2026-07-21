import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { fetchAttendanceDashboard } from "@/lib/lms/attendanceService";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const search = new URL(request.url).searchParams;
  try {
    return NextResponse.json(await fetchAttendanceDashboard(requireLmsAdminClient(), {
      cohort: search.get("cohort") || undefined,
      course: search.get("course") || undefined,
      session: search.get("session") || undefined,
      facilitator: search.get("facilitator") || undefined,
      route: search.get("route") || undefined,
      status: search.get("status") || undefined,
      student: search.get("student") || undefined,
      from: search.get("from") || undefined,
      to: search.get("to") || undefined,
    }));
  } catch (error) {
    return lmsApiError(error, "Attendance dashboard could not be loaded.");
  }
}
