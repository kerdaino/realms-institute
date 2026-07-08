import { AdminShell } from "@/components/admin/AdminShell";
import { RegistrationsManager } from "@/components/admin/RegistrationsManager";
import { requireAdmin } from "@/lib/adminAuth";

export default async function AdminRegistrationsPage() {
  await requireAdmin();
  return <AdminShell title="Registrations" description="Search, review, update, and export paid registration applications."><RegistrationsManager /></AdminShell>;
}
