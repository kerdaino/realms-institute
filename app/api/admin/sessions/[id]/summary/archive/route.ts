import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { transitionClassSummary } from "@/lib/lms/sessionService";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (!isUuid(id) || !body || typeof body.summary_id !== "string") return NextResponse.json({ message: "A current published summary is required." }, { status: 400 }); try { const supabase = requireLmsAdminClient(); const current = await supabase.from("class_summaries").select("id").eq("id", body.summary_id).eq("class_session_id", id).maybeSingle(); if (current.error || !current.data) return NextResponse.json({ message: "Class summary not found." }, { status: 404 }); const summary = await transitionClassSummary(supabase, body.summary_id, "archive", body, { actorLabel: "REALMS Admin" }); return NextResponse.json({ summary }); } catch (error) { return lmsApiError(error, "Class summary could not be archived."); } }
