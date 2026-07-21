import { NextResponse } from "next/server";
import { fetchAdminQuizzes } from "@/lib/lms/assessmentData";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { resolveFacilitatorAssessmentContext } from "@/lib/lms/facilitatorAssessments";
export async function GET() { try { const context = await resolveFacilitatorAssessmentContext(); const quizzes = await fetchAdminQuizzes(context.supabase); return NextResponse.json({ quizzes: quizzes.filter((quiz) => context.offeringIds.includes(String(quiz.cohort_course_id))) }); } catch (error) { return lmsApiError(error, "Assigned quizzes could not be loaded."); } }
