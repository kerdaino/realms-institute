import { notFound } from "next/navigation";
import { AssignmentRecord } from "@/components/admin/AssignmentRecord";
import { PortalShell } from "@/components/portal/PortalShell";
import { fetchAssignmentDetail, fetchAssessmentOptions } from "@/lib/lms/assessmentData";
import { LmsAdminDataError } from "@/lib/lms/adminData";
import { requireFacilitatorAssessmentRecord, resolveFacilitatorAssessmentContext } from "@/lib/lms/facilitatorAssessments";
export default async function FacilitatorAssignmentPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const { detail, options } = await load(id); return <PortalShell eyebrow="Faculty Portal" title={String(detail.assignment.title)} description="Submission review, rubric grading, and feedback for your assigned course."><AssignmentRecord detail={detail} options={options} scope="facilitator" /></PortalShell>; }
async function load(id: string) { try { const context = await resolveFacilitatorAssessmentContext(); await requireFacilitatorAssessmentRecord(context, "assignment", id); const [detail, allOptions] = await Promise.all([fetchAssignmentDetail(context.supabase, id), fetchAssessmentOptions(context.supabase)]); return { detail, options: { offerings: allOptions.offerings.filter((item) => context.offeringIds.includes(item.id)), sessions: allOptions.sessions.filter((item) => context.offeringIds.includes(item.cohort_course_id)) } }; } catch (error) { if (error instanceof LmsAdminDataError && [403, 404].includes(error.status)) notFound(); throw error; } }
