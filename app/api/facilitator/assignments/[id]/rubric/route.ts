import { NextResponse } from "next/server";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { addRubricCriterion } from "@/lib/lms/assessmentService";
import { requireFacilitatorAssessmentRecord, resolveFacilitatorAssessmentContext } from "@/lib/lms/facilitatorAssessments";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid rubric request is required." }, { status: 400 }); try { const context = await resolveFacilitatorAssessmentContext(); await requireFacilitatorAssessmentRecord(context, "assignment", id); return NextResponse.json({ criterion: await addRubricCriterion(context.supabase, id, body) }, { status: 201 }); } catch (error) { return lmsApiError(error, "Rubric criterion could not be created."); } }
