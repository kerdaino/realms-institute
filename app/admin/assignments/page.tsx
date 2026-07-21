import { AdminShell } from "@/components/admin/AdminShell";
import { AssignmentManager } from "@/components/admin/AssignmentManager";
import { requireAdmin } from "@/lib/adminAuth";
import { fetchAdminAssignments, fetchAssessmentOptions } from "@/lib/lms/assessmentData";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
function value(input: string | string[] | undefined) { return typeof input === "string" ? input.slice(0, 200) : undefined; }
export default async function AdminAssignmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { await requireAdmin(); const p = await searchParams; const supabase = requireLmsAdminClient(); const [assignments, options] = await Promise.all([fetchAdminAssignments(supabase, { cohort: value(p.cohort), course: value(p.course), type: value(p.type), domain: value(p.domain), category: value(p.category), status: value(p.status), due: value(p.due) }), fetchAssessmentOptions(supabase)]); return <AdminShell title="Assignments" description="Draft, publish, review, and grade assignments, practicals, reflections, projects, and capstones without calculating final programme results."><AssignmentManager assignments={assignments} options={options} /></AdminShell>; }
