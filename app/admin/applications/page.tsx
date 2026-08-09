import { AdminShell } from "@/components/admin/AdminShell";
import { RegistrationsManager } from "@/components/admin/RegistrationsManager";
import { requireAdmin } from "@/lib/adminAuth";
import { isApplicationRecordScope } from "@/lib/applicationLifecycle";

export default async function AdminApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const search = await searchParams;
  const requestedScope = typeof search.recordScope === "string" ? search.recordScope : "active";
  const initialRecordScope = isApplicationRecordScope(requestedScope) ? requestedScope : "active";
  return <AdminShell title="Applications" description="Search, filter, and review paid applications and scholarship requests without conflating route approval, funding, or admission."><RegistrationsManager initialRecordScope={initialRecordScope} /></AdminShell>;
}
