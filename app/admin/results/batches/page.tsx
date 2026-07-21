import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { BatchCreateForm } from "@/components/admin/ResultActions";
import { requireAdmin } from "@/lib/adminAuth";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { fetchResultBatches } from "@/lib/lms/resultData";
import { humanizeResult } from "@/lib/lms/results";
export const dynamic = "force-dynamic";
function relation(value: unknown) { const item = Array.isArray(value) ? value[0] : value; return item && typeof item === "object" ? item as Record<string, unknown> : {}; }
export default async function ResultBatchesPage() { await requireAdmin(); const supabase = requireLmsAdminClient(); const [batches, cohorts] = await Promise.all([fetchResultBatches(supabase), supabase.from("cohorts").select("id, code, name").order("start_date", { ascending: false, nullsFirst: false })]); return <AdminShell title="Result Approval Batches" description="Documentary institutional review, approval, and publication remain distinct from result calculation."><Link href="/admin/results" className="text-sm font-semibold text-amber-800">← Results</Link><div className="mt-6"><BatchCreateForm cohorts={cohorts.data ?? []} /></div><div className="mt-6 grid gap-4">{batches.map((batch) => { const cohort = relation(batch.cohorts); const items = batch.academic_result_batch_items as Record<string, unknown>[]; return <Link key={batch.id} href={`/admin/results/batches/${batch.id}`} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{String(cohort.code)} · {humanizeResult(batch.batch_status)}</p><h2 className="mt-2 text-xl font-semibold">{batch.batch_name}</h2><p className="mt-2 text-sm text-slate-600">{items.length} included result(s) · Approval reference: {batch.approval_reference ?? "Not recorded"}</p></Link>; })}</div></AdminShell>; }
