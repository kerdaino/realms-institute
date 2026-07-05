import { AdminShell } from "@/components/admin/AdminShell";
import { RegistrationDetail } from "@/components/admin/RegistrationDetail";
import { requireAdmin } from "@/lib/adminAuth";

export default async function AdminRegistrationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  return <AdminShell title="Registration details" description="Applicant, cohort, payment, and email-delivery information for this registration."><RegistrationDetail id={id} /></AdminShell>;
}
