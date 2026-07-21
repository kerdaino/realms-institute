import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { fetchAdminAssignments, fetchAssessmentOptions } from "@/lib/lms/assessmentData";
import { saveAssignment } from "@/lib/lms/assessmentService";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";

export async function GET(request: Request) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); try { const p = new URL(request.url).searchParams; const supabase = requireLmsAdminClient(); const [assignments, options] = await Promise.all([fetchAdminAssignments(supabase, { cohort: p.get("cohort") ?? undefined, course: p.get("course") ?? undefined, type: p.get("type") ?? undefined, domain: p.get("domain") ?? undefined, category: p.get("category") ?? undefined, status: p.get("status") ?? undefined, due: p.get("due") ?? undefined }), fetchAssessmentOptions(supabase)]); return NextResponse.json({ assignments, options }); } catch (error) { return lmsApiError(error, "Assignments could not be loaded."); } }
export async function POST(request: Request) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const body = await readJsonObject(request); if (!body) return NextResponse.json({ message: "A valid request body is required." }, { status: 400 }); try { return NextResponse.json({ assignment: await saveAssignment(requireLmsAdminClient(), body, { actorLabel: "REALMS Admin" }) }, { status: 201 }); } catch (error) { return lmsApiError(error, "Assignment could not be created."); } }
