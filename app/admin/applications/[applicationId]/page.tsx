import { AdminShell } from "@/components/admin/AdminShell";
import { RegistrationDetail } from "@/components/admin/RegistrationDetail";
import { requireAdmin } from "@/lib/adminAuth";

export default async function AdminApplicationDetailPage({ params }: { params: Promise<{ applicationId: string }> }) {
  await requireAdmin();
  const { applicationId } = await params;
  return <AdminShell title="Application details" description="Review applicant information, programme selection, advanced-entry eligibility, funding, payment, admission, and email delivery."><RegistrationDetail id={applicationId} /></AdminShell>;
}
