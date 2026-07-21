import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { AssignmentRecord } from "@/components/admin/AssignmentRecord";
import { requireAdmin } from "@/lib/adminAuth";
import { fetchAssignmentDetail, fetchAssessmentOptions } from "@/lib/lms/assessmentData";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
export default async function AdminAssignmentPage({ params }: { params: Promise<{ id: string }> }) { await requireAdmin(); const { id } = await params; const { detail, options } = await load(id); return <AdminShell title={String(detail.assignment.title)} description="Assignment configuration, rubric, submissions, feedback, and preserved grade history."><AssignmentRecord detail={detail} options={options} /></AdminShell>; }
async function load(id: string) { try { const supabase = requireLmsAdminClient(); const [detail, options] = await Promise.all([fetchAssignmentDetail(supabase, id), fetchAssessmentOptions(supabase)]); return { detail, options }; } catch (error) { if (error instanceof LmsAdminDataError && error.status === 404) notFound(); throw error; } }
