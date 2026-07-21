import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { fetchAdminSessions, fetchSessionOptions } from "@/lib/lms/sessionData";
import { createClassSession } from "@/lib/lms/sessionService";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try { const params = new URL(request.url).searchParams; const filters = { search: params.get("search") || undefined, cohort: params.get("cohort") || undefined, course: params.get("course") || undefined, category: params.get("category") || undefined, route: params.get("route") || undefined, pathway: params.get("pathway") || undefined, facilitator: params.get("facilitator") || undefined, deliveryMode: params.get("deliveryMode") || undefined, status: params.get("status") || undefined, from: params.get("from") || undefined, to: params.get("to") || undefined }; const supabase = requireLmsAdminClient(); const [sessions, options] = await Promise.all([fetchAdminSessions(supabase, filters), fetchSessionOptions(supabase)]); return NextResponse.json({ sessions, options }); }
  catch (error) { return lmsApiError(error, "Class sessions could not be loaded."); }
}
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const body = await readJsonObject(request); if (!body) return NextResponse.json({ message: "A valid request body is required." }, { status: 400 });
  try { const session = await createClassSession(requireLmsAdminClient(), body, { actorLabel: "REALMS Admin" }); return NextResponse.json({ session }, { status: 201 }); }
  catch (error) { return lmsApiError(error, "Class session could not be created."); }
}
