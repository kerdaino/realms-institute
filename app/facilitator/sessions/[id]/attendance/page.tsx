import { PortalShell } from "@/components/portal/PortalShell";
import { AttendanceRoster } from "@/components/attendance/AttendanceRoster";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { fetchSessionAttendance } from "@/lib/lms/attendanceService";
import { requireRole } from "@/lib/lms/auth";
import { requireFacilitatorSessionAccess, resolveFacilitatorSessionContext } from "@/lib/lms/facilitatorSessions";

export const dynamic = "force-dynamic";

export default async function FacilitatorSessionAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("facilitator"); const { id } = await params; const context = await resolveFacilitatorSessionContext(); await requireFacilitatorSessionAccess(context, id);
  const record = await fetchSessionAttendance(requireLmsAdminClient(), id);
  return <PortalShell eyebrow="Faculty Attendance" title={`${record.session.title} attendance`} description="Record evidence only for students assigned to this session."><AttendanceRoster sessionId={id} initialRecord={record as never} scope="facilitator" /></PortalShell>;
}
