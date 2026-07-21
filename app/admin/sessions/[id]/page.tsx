import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { SessionRecord } from "@/components/admin/SessionRecord";
import { requireAdmin } from "@/lib/adminAuth";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
import { fetchAdminSession, fetchSessionOptions } from "@/lib/lms/sessionData";
export default async function AdminSessionPage({ params }: { params: Promise<{ id: string }> }) { await requireAdmin(); const { id } = await params; const record = await load(id); return <AdminShell title={record.detail.session.title} description="Class session operations, summary archive, resources, and recording metadata"><SessionRecord initialRecord={record.detail} options={record.options} /></AdminShell>; }
async function load(id: string) { try { const supabase = requireLmsAdminClient(); const [detail, options] = await Promise.all([fetchAdminSession(supabase, id), fetchSessionOptions(supabase)]); return { detail, options }; } catch (error) { if (error instanceof LmsAdminDataError && error.status === 404) notFound(); throw error; } }
