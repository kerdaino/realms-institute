import { notFound } from "next/navigation";

import { AdminShell } from "@/components/admin/AdminShell";
import { StudentRecord } from "@/components/admin/StudentRecord";
import { requireAdmin } from "@/lib/adminAuth";
import { fetchAdminStudent, LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";

export default async function AdminStudentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const record = await loadStudent(id);
  return <AdminShell title={record.student.legal_name} description={`Student master record · ${record.student.student_number}`}><StudentRecord initialRecord={record} /></AdminShell>;
}

async function loadStudent(id: string) {
  try {
    return await fetchAdminStudent(requireLmsAdminClient(), id);
  } catch (error) {
    if (error instanceof LmsAdminDataError && error.status === 404) notFound();
    throw error;
  }
}
