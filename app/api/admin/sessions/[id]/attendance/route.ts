import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { fetchSessionAttendance, ensureSessionAttendanceRoster } from "@/lib/lms/attendanceService";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ message: "Class session not found." }, { status: 404 });
  try { return NextResponse.json(await fetchSessionAttendance(requireLmsAdminClient(), id)); }
  catch (error) { return lmsApiError(error, "Session attendance could not be loaded."); }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ message: "Class session not found." }, { status: 404 });
  try {
    const supabase = requireLmsAdminClient();
    return NextResponse.json({ result: await ensureSessionAttendanceRoster(supabase, id, { actorLabel: "REALMS Admin" }), attendance: await fetchSessionAttendance(supabase, id) });
  } catch (error) { return lmsApiError(error, "Attendance roster could not be initialized."); }
}
