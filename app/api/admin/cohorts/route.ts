import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { cohortStatuses, isOneOf, readNullableDate, readText } from "@/lib/lms/adminConstants";
import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { fetchAdminCohorts, requireLmsAdminClient } from "@/lib/lms/adminData";
export async function GET() { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); try { return NextResponse.json({ cohorts: await fetchAdminCohorts(requireLmsAdminClient()) }); } catch { return NextResponse.json({ message: "Cohorts could not be loaded." }, { status: 500 }); } }

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const code = readText(body?.code, 60)?.toUpperCase();
  const name = readText(body?.name, 180);
  const startDate = readNullableDate(body?.startDate);
  const endDate = readNullableDate(body?.endDate);
  if (!body || !code || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(code) || !name || !isOneOf(cohortStatuses, body.status) || startDate === undefined || endDate === undefined) return NextResponse.json({ message: "Enter a valid cohort code, name, status, and optional programme dates." }, { status: 400 });
  if (startDate && endDate && endDate < startDate) return NextResponse.json({ message: "The cohort end date must be after its start date." }, { status: 400 });
  const supabase = requireLmsAdminClient();
  const created = await supabase.from("cohorts").insert({ code, name, status: body.status, start_date: startDate, end_date: endDate, school: readText(body.school, 180) || "School of Discovery", programme: readText(body.programme, 180) || "REALMS School of Discovery", registration_status: "closed", is_public_registration_cohort: false }).select("*").single();
  if (created.error || !created.data) return NextResponse.json({ message: created.error?.code === "23505" ? "A cohort with this code already exists." : "Cohort could not be created." }, { status: created.error?.code === "23505" ? 409 : 500 });
  await recordLmsAudit(supabase, { action: "cohort_created", entityType: "cohort", entityId: created.data.id, metadata: { code, name, registration_status: "closed", actor: "REALMS Admin" } });
  return NextResponse.json({ cohort: created.data }, { status: 201 });
}
