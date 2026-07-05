import { AdminShell } from "@/components/admin/AdminShell";
import { RegistrationsManager } from "@/components/admin/RegistrationsManager";
import { requireAdmin } from "@/lib/adminAuth";

export default async function AdminRegistrationsPage() {
  await requireAdmin();
  return <AdminShell title="Registrations" description="Search, review, and export confirmed cohort registration records."><RegistrationsManager /></AdminShell>;
}
