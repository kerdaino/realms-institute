import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { cohortStatuses, isOneOf, readNullableDate, readNullableTimestamp, readText } from "@/lib/lms/adminConstants";
import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { fetchAdminCohorts, requireLmsAdminClient } from "@/lib/lms/adminData";
import { cohortCalendarValidationErrors } from "@/lib/lms/cohortCalendar";
export async function GET() { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); try { return NextResponse.json({ cohorts: await fetchAdminCohorts(requireLmsAdminClient()) }); } catch { return NextResponse.json({ message: "Cohorts could not be loaded." }, { status: 500 }); } }

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const code = readText(body?.code, 60)?.toUpperCase();
  const name = readText(body?.name, 180);
  const startDate = readNullableDate(body?.startDate);
  const endDate = readNullableDate(body?.endDate);
  const teachingStartDate = readNullableDate(body?.teachingStartDate); const teachingEndDate = readNullableDate(body?.teachingEndDate); const completionPeriodStartDate = readNullableDate(body?.completionPeriodStartDate); const completionPeriodEndDate = readNullableDate(body?.completionPeriodEndDate); const orientationDate = readNullableDate(body?.orientationDate); const matriculationDate = readNullableDate(body?.matriculationDate); const graduationDate = readNullableDate(body?.graduationDate);
  const orientationStartAt = readNullableTimestamp(body?.orientationStartAt); const matriculationStartAt = readNullableTimestamp(body?.matriculationStartAt); const graduationStartAt = readNullableTimestamp(body?.graduationStartAt); const teachingWeekCount = body?.teachingWeekCount === "" || body?.teachingWeekCount == null ? null : Number(body.teachingWeekCount);
  if (!body || !code || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(code) || !name || !isOneOf(cohortStatuses, body.status) || [startDate, endDate, teachingStartDate, teachingEndDate, completionPeriodStartDate, completionPeriodEndDate, orientationDate, matriculationDate, graduationDate, orientationStartAt, matriculationStartAt, graduationStartAt].some((value) => value === undefined)) return NextResponse.json({ message: "Enter a valid cohort code, name, status, and optional calendar dates." }, { status: 400 });
  const calendar = { startDate: startDate as string | null, endDate: endDate as string | null, teachingStartDate: teachingStartDate as string | null, teachingEndDate: teachingEndDate as string | null, teachingWeekCount, completionPeriodStartDate: completionPeriodStartDate as string | null, completionPeriodEndDate: completionPeriodEndDate as string | null, orientationDate: orientationDate as string | null, orientationStartAt: orientationStartAt as string | null, matriculationDate: matriculationDate as string | null, matriculationStartAt: matriculationStartAt as string | null, graduationDate: graduationDate as string | null, graduationStartAt: graduationStartAt as string | null };
  const calendarErrors = cohortCalendarValidationErrors(calendar);
  if (calendarErrors.length) return NextResponse.json({ message: calendarErrors[0], errors: calendarErrors }, { status: 400 });
  const supabase = requireLmsAdminClient();
  const created = await supabase.from("cohorts").insert({ code, name, status: body.status, start_date: startDate, end_date: endDate, teaching_start_date: teachingStartDate, teaching_end_date: teachingEndDate, teaching_week_count: teachingWeekCount, completion_period_start_date: completionPeriodStartDate, completion_period_end_date: completionPeriodEndDate, orientation_date: orientationDate, orientation_start_at: orientationStartAt, matriculation_date: matriculationDate, matriculation_start_at: matriculationStartAt, graduation_date: graduationDate, graduation_start_at: graduationStartAt, school: readText(body.school, 180) || "School of Discovery", programme: readText(body.programme, 180) || "REALMS School of Discovery", registration_status: "closed", is_public_registration_cohort: false }).select("*").single();
  if (created.error || !created.data) return NextResponse.json({ message: created.error?.code === "23505" ? "A cohort with this code already exists." : "Cohort could not be created." }, { status: created.error?.code === "23505" ? 409 : 500 });
  await recordLmsAudit(supabase, { action: "cohort_created", entityType: "cohort", entityId: created.data.id, metadata: { code, name, registration_status: "closed", actor: "REALMS Admin" } });
  return NextResponse.json({ cohort: created.data }, { status: 201 });
}
