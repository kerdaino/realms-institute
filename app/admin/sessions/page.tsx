import { AdminShell } from "@/components/admin/AdminShell";
import { SessionsManager } from "@/components/admin/SessionsManager";
import { requireAdmin } from "@/lib/adminAuth";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { fetchAdminSessions, fetchSessionOptions } from "@/lib/lms/sessionData";

function value(input: string | string[] | undefined) { return typeof input === "string" ? input.slice(0, 200) : undefined; }
export default async function AdminSessionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin(); const params = await searchParams; const filters = { search: value(params.search), cohort: value(params.cohort), course: value(params.course), category: value(params.category), route: value(params.route), pathway: value(params.pathway), facilitator: value(params.facilitator), deliveryMode: value(params.deliveryMode), status: value(params.status), from: value(params.from), to: value(params.to) }; const supabase = requireLmsAdminClient(); const [sessions, options] = await Promise.all([fetchAdminSessions(supabase, filters), fetchSessionOptions(supabase)]);
  return <AdminShell title="Class Sessions" description="Create and manage the scheduled academic delivery attached to each cohort course."><SessionsManager initialSessions={sessions} options={options} filters={filters} /></AdminShell>;
}
