import { AdminShell } from "@/components/admin/AdminShell";
import { RegistrationDetail } from "@/components/admin/RegistrationDetail";
import { requireAdmin } from "@/lib/adminAuth";

export default async function AdminRegistrationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  return <AdminShell title="Application details" description="Review applicant information, programme selection, advanced-entry eligibility, funding, payment, admission, and email delivery."><RegistrationDetail id={id} /></AdminShell>;
}
