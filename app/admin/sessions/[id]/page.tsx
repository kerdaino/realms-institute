import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { SessionRecord } from "@/components/admin/SessionRecord";
import { requireAdmin } from "@/lib/adminAuth";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
import { fetchAdminSession, fetchSessionOptions } from "@/lib/lms/sessionData";
export default async function AdminSessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ checkpoint?: string }> }) { await requireAdmin(); const [{ id }, query] = await Promise.all([params, searchParams]); const record = await load(id); const checkpointMessage = query.checkpoint === "created" ? "Checkpoint created successfully." : query.checkpoint === "removed" ? "Checkpoint removed successfully." : query.checkpoint === "updated" ? "Checkpoint updated successfully." : undefined; return <AdminShell title={record.detail.session.title} description="Class session operations, summary archive, resources, and recording metadata"><SessionRecord initialRecord={record.detail} options={record.options} checkpointMessage={checkpointMessage} /></AdminShell>; }
async function load(id: string) { try { const supabase = requireLmsAdminClient(); const [detail, options] = await Promise.all([fetchAdminSession(supabase, id), fetchSessionOptions(supabase)]); return { detail, options }; } catch (error) { if (error instanceof LmsAdminDataError && error.status === 404) notFound(); throw error; } }
