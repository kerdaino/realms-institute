import { AdminShell } from "@/components/admin/AdminShell";
import { RegistrationsManager } from "@/components/admin/RegistrationsManager";
import { requireAdmin } from "@/lib/adminAuth";

export default async function AdminRegistrationsPage() {
  await requireAdmin();
  return <AdminShell title="Applications" description="Search, filter, and review paid applications and scholarship requests without conflating route approval, funding, or admission."><RegistrationsManager /></AdminShell>;
}
