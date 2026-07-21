import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { fetchAdminAbsenceMakeup } from "@/lib/lms/absenceData";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
export async function GET(request: Request) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); try { const params = new URL(request.url).searchParams; return NextResponse.json(await fetchAdminAbsenceMakeup(requireLmsAdminClient(), { status: params.get("status") ?? undefined, makeup: params.get("makeup") ?? undefined, cohort: params.get("cohort") ?? undefined, course: params.get("course") ?? undefined, student: params.get("student") ?? undefined })); } catch (error) { return lmsApiError(error, "Absence and make-up records could not be loaded."); } }
