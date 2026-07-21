import { NextResponse } from "next/server";
import { submitStudentAbsenceRequest } from "@/lib/lms/absenceService";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { requireStudentAbsenceApi } from "@/lib/lms/studentAbsenceApi";
import { recordStudentMeaningfulActivity } from "@/lib/lms/engagementService";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; if (!isUuid(id)) return NextResponse.json({ message: "A valid absence request is required." }, { status: 400 }); try { const context = await requireStudentAbsenceApi(); const result = await submitStudentAbsenceRequest(context.supabase, context.user.id, id); await recordStudentMeaningfulActivity(context.supabase, context.user.id); return NextResponse.json(result); } catch (error) { return lmsApiError(error, "Absence request could not be submitted."); } }
