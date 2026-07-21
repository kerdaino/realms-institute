import { NextResponse } from "next/server";

import { isUuid } from "@/lib/lms/adminConstants";
import { ensureSessionAttendanceRoster, fetchSessionAttendance } from "@/lib/lms/attendanceService";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { requireFacilitatorSessionAccess, resolveFacilitatorSessionContext } from "@/lib/lms/facilitatorSessions";

async function access(id: string) {
  const context = await resolveFacilitatorSessionContext();
  await requireFacilitatorSessionAccess(context, id);
  return context;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ message: "Class session not found." }, { status: 404 });
  try { await access(id); return NextResponse.json(await fetchSessionAttendance(requireLmsAdminClient(), id)); }
  catch (error) { return lmsApiError(error, "Session attendance could not be loaded."); }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ message: "Class session not found." }, { status: 404 });
  try {
    const context = await access(id); const admin = requireLmsAdminClient();
    return NextResponse.json({ result: await ensureSessionAttendanceRoster(admin, id, { actorLabel: "Facilitator", actorUserId: context.userId, auditClient: admin }), attendance: await fetchSessionAttendance(admin, id) });
  } catch (error) { return lmsApiError(error, "Attendance roster could not be initialized."); }
}
