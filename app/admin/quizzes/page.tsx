import { AdminShell } from "@/components/admin/AdminShell";
import { QuizManager } from "@/components/admin/QuizManager";
import { requireAdmin } from "@/lib/adminAuth";
import { fetchAdminQuizzes, fetchAssessmentOptions } from "@/lib/lms/assessmentData";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
function value(input: string | string[] | undefined) { return typeof input === "string" ? input.slice(0, 200) : undefined; }
export default async function AdminQuizzesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { await requireAdmin(); const p = await searchParams; const supabase = requireLmsAdminClient(); const [quizzes, options] = await Promise.all([fetchAdminQuizzes(supabase, { cohort: value(p.cohort), course: value(p.course), type: value(p.type), domain: value(p.domain), category: value(p.category), status: value(p.status) }), fetchAssessmentOptions(supabase)]); return <AdminShell title="Quizzes" description="Build secure quizzes, keep answer keys private, and manage automatic and manual grading."><QuizManager quizzes={quizzes} options={options} /></AdminShell>; }
