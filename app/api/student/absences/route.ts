import { NextResponse } from "next/server";
import { getStudentAbsenceRequests, getStudentStandaloneMakeups } from "@/lib/lms/absenceData";
import { createStudentAbsenceRequest } from "@/lib/lms/absenceService";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireStudentAbsenceApi } from "@/lib/lms/studentAbsenceApi";
import { recordStudentMeaningfulActivity } from "@/lib/lms/engagementService";

export async function GET() { try { const context = await requireStudentAbsenceApi(); const [requests, standaloneMakeups] = await Promise.all([getStudentAbsenceRequests(context.user.id), getStudentStandaloneMakeups(context.user.id)]); return NextResponse.json({ requests, standaloneMakeups }); } catch (error) { return lmsApiError(error, "Absence requests could not be loaded."); } }
export async function POST(request: Request) { const body = await readJsonObject(request); if (!body) return NextResponse.json({ message: "A valid request body is required." }, { status: 400 }); try { const context = await requireStudentAbsenceApi(); const result = await createStudentAbsenceRequest(context.supabase, context.user.id, body); await recordStudentMeaningfulActivity(context.supabase, context.user.id); return NextResponse.json(result, { status: result.created ? 201 : 200 }); } catch (error) { return lmsApiError(error, "Absence request could not be created."); } }
