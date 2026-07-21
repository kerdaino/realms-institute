import { NextResponse } from "next/server";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { saveQuizAnswer } from "@/lib/lms/assessmentService";
import { recordStudentMeaningfulActivity } from "@/lib/lms/engagementService";
import { resolveStudentAssessmentApiContext } from "@/lib/lms/studentAssessmentApi";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid quiz answer is required." }, { status: 400 }); try { const { user, supabase } = await resolveStudentAssessmentApiContext(); const answer = await saveQuizAnswer(supabase, user.id, id, body); await recordStudentMeaningfulActivity(supabase, user.id); return NextResponse.json({ answer }); } catch (error) { return lmsApiError(error, "Quiz answer could not be saved."); } }
