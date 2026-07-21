import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { QuizRecord } from "@/components/admin/QuizRecord";
import { requireAdmin } from "@/lib/adminAuth";
import { fetchQuizDetail } from "@/lib/lms/assessmentData";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
export default async function AdminQuizPage({ params }: { params: Promise<{ id: string }> }) { await requireAdmin(); const { id } = await params; const detail = await load(id); return <AdminShell title={String(detail.quiz.title)} description="Question builder, publication checks, attempts, manual review, and grade history."><QuizRecord detail={detail} /></AdminShell>; }
async function load(id: string) { try { return await fetchQuizDetail(requireLmsAdminClient(), id); } catch (error) { if (error instanceof LmsAdminDataError && error.status === 404) notFound(); throw error; } }
