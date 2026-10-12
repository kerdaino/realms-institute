import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { closeAssignment, setAssignmentStatus } from "@/lib/lms/assessmentService";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid status request is required." }, { status: 400 }); try { const supabase = requireLmsAdminClient(); const actor = { actorLabel: "REALMS Admin" as const }; return NextResponse.json(body.assignment_status === "closed" ? { assignment: await closeAssignment(supabase, id, body, actor) } : await setAssignmentStatus(supabase, id, body, actor)); } catch (error) { return lmsApiError(error, "Assignment status could not be updated."); } }
