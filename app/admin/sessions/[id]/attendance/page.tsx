import { notFound } from "next/navigation";

import { AdminShell } from "@/components/admin/AdminShell";
import { AttendanceRoster } from "@/components/attendance/AttendanceRoster";
import { requireAdmin } from "@/lib/adminAuth";
import { fetchSessionAttendance } from "@/lib/lms/attendanceService";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";

export default async function AdminSessionAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(); const { id } = await params;
  const record = await loadAttendance(id);
  return <AdminShell title={`${record.session.title} attendance`} description="Initialize, review, finalize, and correct the attendance roster with preserved history."><AttendanceRoster sessionId={id} initialRecord={record as never} scope="admin" /></AdminShell>;
}

async function loadAttendance(id: string) {
  try {
    return await fetchSessionAttendance(requireLmsAdminClient(), id);
  } catch (error) { if (error instanceof LmsAdminDataError && error.status === 404) notFound(); throw error; }
}
