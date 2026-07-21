import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { onboardingStatuses, studentStatuses, isOneOf, isUuid } from "@/lib/lms/adminConstants";
import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { fetchAdminStudent, requireLmsAdminClient } from "@/lib/lms/adminData";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ message: "Student not found." }, { status: 404 });
  try { return NextResponse.json(await fetchAdminStudent(requireLmsAdminClient(), id)); }
  catch { return NextResponse.json({ message: "Student could not be loaded." }, { status: 500 }); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ message: "Student not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !isOneOf(studentStatuses, body.student_status) || !isOneOf(onboardingStatuses, body.onboarding_status) || typeof body.orientation_completed !== "boolean" || typeof body.matriculated !== "boolean") return NextResponse.json({ message: "Valid student and onboarding statuses are required." }, { status: 400 });
  const supabase = requireLmsAdminClient();
  const current = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  if (current.error || !current.data) return NextResponse.json({ message: "Student not found." }, { status: 404 });
  const now = new Date().toISOString();
  const updates = { student_status: body.student_status, onboarding_status: body.onboarding_status, orientation_completed_at: body.orientation_completed ? current.data.orientation_completed_at || now : current.data.orientation_completed_at, matriculated_at: body.matriculated ? current.data.matriculated_at || now : current.data.matriculated_at, updated_at: now };
  const result = await supabase.from("students").update(updates).eq("id", id).select("*, profiles(id, account_status)").single();
  if (result.error) return NextResponse.json({ message: "Student record could not be updated." }, { status: 500 });
  const audits: Promise<void>[] = [];
  if (current.data.student_status !== updates.student_status) audits.push(recordLmsAudit(supabase, { action: "student_status_changed", entityType: "student", entityId: id, metadata: { previous: current.data.student_status, next: updates.student_status } }));
  if (current.data.onboarding_status !== updates.onboarding_status) audits.push(recordLmsAudit(supabase, { action: "student_onboarding_updated", entityType: "student", entityId: id, metadata: { previous: current.data.onboarding_status, next: updates.onboarding_status } }));
  if (!current.data.orientation_completed_at && updates.orientation_completed_at) audits.push(recordLmsAudit(supabase, { action: "student_orientation_completed", entityType: "student", entityId: id }));
  if (!current.data.matriculated_at && updates.matriculated_at) audits.push(recordLmsAudit(supabase, { action: "student_matriculated", entityType: "student", entityId: id }));
  await Promise.all(audits);
  return NextResponse.json({ student: result.data });
}
