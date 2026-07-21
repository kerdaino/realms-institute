import { NextResponse } from "next/server";
import { addStudentAbsenceEvidence } from "@/lib/lms/absenceService";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireStudentAbsenceApi } from "@/lib/lms/studentAbsenceApi";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; const body = await readJsonObject(request); if (!isUuid(id) || !body) return NextResponse.json({ message: "Valid evidence metadata is required." }, { status: 400 }); try { const context = await requireStudentAbsenceApi(); return NextResponse.json({ evidence: await addStudentAbsenceEvidence(context.supabase, context.user.id, id, body) }, { status: 201 }); } catch (error) { return lmsApiError(error, "Supporting evidence could not be saved."); } }
