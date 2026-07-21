import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { fetchAdminAbsenceRequest } from "@/lib/lms/absenceData";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const { id } = await params; if (!isUuid(id)) return NextResponse.json({ message: "A valid absence request is required." }, { status: 400 }); try { return NextResponse.json(await fetchAdminAbsenceRequest(requireLmsAdminClient(), id)); } catch (error) { return lmsApiError(error, "Absence review could not be loaded."); } }
