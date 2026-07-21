import { NextResponse } from "next/server";
import { getStudentAbsenceRequest } from "@/lib/lms/absenceData";
import { updateStudentAbsenceRequest } from "@/lib/lms/absenceService";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireStudentAbsenceApi } from "@/lib/lms/studentAbsenceApi";
import { recordStudentMeaningfulActivity } from "@/lib/lms/engagementService";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; if (!isUuid(id)) return NextResponse.json({ message: "A valid absence request is required." }, { status: 400 }); try { const context = await requireStudentAbsenceApi(); const result = await getStudentAbsenceRequest(context.user.id, id); return result ? NextResponse.json({ request: result }) : NextResponse.json({ message: "Absence request not found." }, { status: 404 }); } catch (error) { return lmsApiError(error, "Absence request could not be loaded."); } }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; const body = await readJsonObject(request); if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid absence update is required." }, { status: 400 }); try { const context = await requireStudentAbsenceApi(); const result = await updateStudentAbsenceRequest(context.supabase, context.user.id, id, body); await recordStudentMeaningfulActivity(context.supabase, context.user.id); return NextResponse.json({ request: result }); } catch (error) { return lmsApiError(error, "Absence request could not be updated."); } }
