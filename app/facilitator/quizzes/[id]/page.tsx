import { notFound } from "next/navigation";
import { QuizRecord } from "@/components/admin/QuizRecord";
import { PortalShell } from "@/components/portal/PortalShell";
import { fetchQuizDetail } from "@/lib/lms/assessmentData";
import { LmsAdminDataError } from "@/lib/lms/adminData";
import { requireFacilitatorAssessmentRecord, resolveFacilitatorAssessmentContext } from "@/lib/lms/facilitatorAssessments";
export default async function FacilitatorQuizPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const detail = await load(id); return <PortalShell eyebrow="Faculty Portal" title={String(detail.quiz.title)} description="Manual quiz review for your assigned cohort course."><QuizRecord detail={detail} scope="facilitator" /></PortalShell>; }
async function load(id: string) { try { const context = await resolveFacilitatorAssessmentContext(); await requireFacilitatorAssessmentRecord(context, "quiz", id); return await fetchQuizDetail(context.supabase, id, true); } catch (error) { if (error instanceof LmsAdminDataError && [403, 404].includes(error.status)) notFound(); throw error; } }
