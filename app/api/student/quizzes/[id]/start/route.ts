import { NextResponse } from "next/server";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { startQuizAttempt } from "@/lib/lms/assessmentService";
import { recordStudentMeaningfulActivity } from "@/lib/lms/engagementService";
import { resolveStudentAssessmentApiContext } from "@/lib/lms/studentAssessmentApi";
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; if (!isUuid(id)) return NextResponse.json({ message: "Quiz not found." }, { status: 404 }); try { const { user, supabase } = await resolveStudentAssessmentApiContext(); const attempt = await startQuizAttempt(supabase, user.id, id, { actorLabel: "Student", actorUserId: user.id }); await recordStudentMeaningfulActivity(supabase, user.id); return NextResponse.json({ attempt }, { status: 201 }); } catch (error) { return lmsApiError(error, "Quiz attempt could not be started."); } }
