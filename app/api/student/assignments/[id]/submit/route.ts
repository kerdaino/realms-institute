import { NextResponse } from "next/server";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { submitAssignment } from "@/lib/lms/assessmentService";
import { recordStudentMeaningfulActivity } from "@/lib/lms/engagementService";
import { resolveStudentAssessmentApiContext } from "@/lib/lms/studentAssessmentApi";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid submission is required." }, { status: 400 }); try { const { user, supabase } = await resolveStudentAssessmentApiContext(); const submission = await submitAssignment(supabase, user.id, id, body, { actorLabel: "Student", actorUserId: user.id }); await recordStudentMeaningfulActivity(supabase, user.id); return NextResponse.json({ submission }, { status: 201 }); } catch (error) { return lmsApiError(error, "Assignment could not be submitted."); } }
