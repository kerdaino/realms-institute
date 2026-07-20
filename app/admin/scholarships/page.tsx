import { AdminShell } from "@/components/admin/AdminShell";
import { ScholarshipRequestsManager } from "@/components/admin/ScholarshipRequestsManager";
import { requireAdmin } from "@/lib/adminAuth";

export default async function AdminScholarshipsPage() {
  await requireAdmin();
  return <AdminShell title="Scholarship Requests" description="Review registration support requests separately from admission decisions."><ScholarshipRequestsManager /></AdminShell>;
}
