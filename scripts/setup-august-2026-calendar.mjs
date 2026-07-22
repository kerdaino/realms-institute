import { createClient } from "@supabase/supabase-js";

import {
  august2026AdditionalFacilitatorAssignments,
  august2026CohortCode,
  august2026CohortDates,
  august2026Orientation,
  august2026ScheduleConflicts,
  august2026SessionCounts,
  august2026Sessions,
} from "../lib/lms/august2026Calendar.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase administrative environment variables are required.");

const apply = process.argv.includes("--apply");
if (apply && process.env.NEXT_5_APPLY !== "1") throw new Error("Set NEXT_5_APPLY=1 as well as --apply before creating the production calendar.");
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function relation(value) { return Array.isArray(value) ? value[0] ?? {} : value ?? {}; }
function sessionKey(offeringId, sessionNumber) { return `${offeringId}:${sessionNumber}`; }
function sameTimestamp(a, b) { return a && b && new Date(a).toISOString() === new Date(b).toISOString(); }
function matchesSession(current, desired) {
  return current.title === desired.title
    && current.session_type === desired.sessionType
    && current.delivery_mode === desired.deliveryMode
    && sameTimestamp(current.scheduled_start_at, desired.scheduledStartAt)
    && sameTimestamp(current.scheduled_end_at, desired.scheduledEndAt)
    && current.timezone === desired.timezone
    && (current.physical_location ?? null) === desired.physicalLocation;
}

const cohortResult = await supabase.from("cohorts").select("*").eq("code", august2026CohortCode);
if (cohortResult.error) throw new Error(`Cohort lookup: ${cohortResult.error.message}`);
if (cohortResult.data.length !== 1) throw new Error(`Expected exactly one ${august2026CohortCode} cohort.`);
const cohort = cohortResult.data[0];

const [offeringResult, facilitatorResult, assignmentResult, sessionResult, eventProbe] = await Promise.all([
  supabase.from("cohort_courses").select("id, course_id, delivery_mode, schedule_text, status, courses(id, code, title)").eq("cohort_id", cohort.id),
  supabase.from("facilitators").select("id, display_name, facilitator_status").eq("facilitator_status", "active"),
  supabase.from("facilitator_course_assignments").select("id, facilitator_id, cohort_course_id, assignment_role, facilitators(display_name)").in("cohort_course_id", (await supabase.from("cohort_courses").select("id").eq("cohort_id", cohort.id)).data?.map((item) => item.id) ?? []),
  supabase.from("class_sessions").select("id, cohort_course_id, title, description, session_number, session_type, delivery_mode, scheduled_start_at, scheduled_end_at, timezone, live_join_url, physical_location, session_status, visibility_status, facilitator_id, cohort_courses!inner(cohort_id,courses(code))").eq("cohort_courses.cohort_id", cohort.id),
  supabase.from("cohort_events").select("*").eq("cohort_id", cohort.id),
]);
for (const [label, result] of [["Offerings", offeringResult], ["Facilitators", facilitatorResult], ["Assignments", assignmentResult], ["Sessions", sessionResult]]) if (result.error) throw new Error(`${label}: ${result.error.message}`);

const eventTableMissing = Boolean(eventProbe.error && (["42P01", "PGRST205"].includes(eventProbe.error.code ?? "") || /cohort_events/i.test(eventProbe.error.message)));
if (eventProbe.error && !eventTableMissing) throw new Error(`Cohort events: ${eventProbe.error.message}`);

const offeringByCode = new Map(offeringResult.data.map((item) => [relation(item.courses).code, item]));
const facilitatorByName = new Map(facilitatorResult.data.map((item) => [item.display_name, item]));
const requiredCourseCodes = [...new Set(august2026Sessions.map((item) => item.courseCode))];
const missingCoursesOrOfferings = requiredCourseCodes.filter((code) => !offeringByCode.has(code));
const requiredFacilitatorNames = [...new Set(august2026Sessions.flatMap((item) => item.facilitatorName ? [item.facilitatorName] : []))];
const missingFacilitators = requiredFacilitatorNames.filter((name) => !facilitatorByName.has(name));
if (missingCoursesOrOfferings.length || missingFacilitators.length) throw new Error(JSON.stringify({ missingCoursesOrOfferings, missingFacilitators }));

const desiredAssignments = [];
for (const item of august2026Sessions) {
  if (!item.facilitatorName) continue;
  const row = { facilitator_id: facilitatorByName.get(item.facilitatorName).id, cohort_course_id: offeringByCode.get(item.courseCode).id, assignment_role: "lead" };
  if (!desiredAssignments.some((current) => current.facilitator_id === row.facilitator_id && current.cohort_course_id === row.cohort_course_id)) desiredAssignments.push(row);
}
for (const item of august2026AdditionalFacilitatorAssignments) {
  const row = { facilitator_id: facilitatorByName.get(item.facilitatorName).id, cohort_course_id: offeringByCode.get(item.courseCode).id, assignment_role: item.assignmentRole };
  if (!desiredAssignments.some((current) => current.facilitator_id === row.facilitator_id && current.cohort_course_id === row.cohort_course_id && current.assignment_role === row.assignment_role)) desiredAssignments.push(row);
}
const existingAssignmentKeys = new Set(assignmentResult.data.map((item) => `${item.facilitator_id}:${item.cohort_course_id}:${item.assignment_role}`));
const missingAssignments = desiredAssignments.filter((item) => !existingAssignmentKeys.has(`${item.facilitator_id}:${item.cohort_course_id}:${item.assignment_role}`));

const existingByKey = new Map(sessionResult.data.map((item) => [sessionKey(item.cohort_course_id, item.session_number), item]));
const desiredRows = august2026Sessions.map((item) => {
  const offering = offeringByCode.get(item.courseCode);
  return { desired: item, offering, current: existingByKey.get(sessionKey(offering.id, item.sessionNumber)) ?? null };
});
const conflictingSessions = desiredRows.filter((item) => item.current && !matchesSession(item.current, item.desired)).map((item) => ({ id: item.current.id, courseCode: item.desired.courseCode, sessionNumber: item.desired.sessionNumber, existingTitle: item.current.title, desiredTitle: item.desired.title, hasSchedule: Boolean(item.current.scheduled_start_at) }));
for (const conflict of conflictingSessions) {
  conflict.dependencies = {};
  for (const [table, column] of [["session_attendance", "class_session_id"], ["class_summaries", "class_session_id"], ["class_recordings", "class_session_id"], ["session_resources", "class_session_id"], ["session_recording_requirements", "class_session_id"]]) {
    const result = await supabase.from(table).select("id", { count: "exact", head: true }).eq(column, conflict.id);
    if (result.error) throw new Error(`Conflict dependency check ${table}: ${result.error.message}`);
    conflict.dependencies[table] = result.count ?? 0;
  }
}
const missingSessions = desiredRows.filter((item) => !item.current);
const matchingSessions = desiredRows.filter((item) => item.current && matchesSession(item.current, item.desired));

const existingEvent = eventTableMissing ? null : eventProbe.data.find((item) => item.event_key === august2026Orientation.eventKey) ?? null;
const eventConflict = existingEvent && !(existingEvent.title === august2026Orientation.title && sameTimestamp(existingEvent.scheduled_start_at, august2026Orientation.scheduledStartAt) && existingEvent.delivery_mode === august2026Orientation.deliveryMode);
const calendarConflicts = august2026ScheduleConflicts();
const report = {
  mode: apply ? "apply" : "dry-run",
  cohort: { id: cohort.id, code: cohort.code, currentDates: { startDate: cohort.start_date, endDate: cohort.end_date, orientationDate: cohort.orientation_date, matriculationDate: cohort.matriculation_date, graduationDate: cohort.graduation_date }, desiredDates: august2026CohortDates },
  counts: { ...august2026SessionCounts(), totalCoreTeachingSessions: august2026Sessions.length, orientationEvents: 1 },
  catalogue: { requiredCourses: requiredCourseCodes.length, existingOfferings: offeringResult.data.length, coursesOrOfferingsCreated: 0, missingCoursesOrOfferings, missingFacilitators },
  preparation: { matchingSessions: matchingSessions.length, missingSessions: missingSessions.length, conflictingSessions, missingFacilitatorAssignments: missingAssignments.length, cohortEventMigrationRequired: eventTableMissing, orientationStatus: eventTableMissing ? "migration_required" : eventConflict ? "conflict" : existingEvent ? "already_prepared" : "missing" },
  scheduleReview: calendarConflicts,
};

if (!apply) {
  console.log(JSON.stringify(report, null, 2));
  if (conflictingSessions.length || eventConflict) process.exitCode = 2;
} else {
  if (eventTableMissing) throw new Error("Apply supabase/lms_next_5_august_calendar.sql before running the calendar setup.");
  if (conflictingSessions.length || eventConflict) throw new Error(`Existing calendar records require manual review before setup: ${JSON.stringify({ conflictingSessions, eventConflict: Boolean(eventConflict) })}`);
  const cohortUpdate = await supabase.from("cohorts").update({ start_date: august2026CohortDates.startDate, end_date: august2026CohortDates.endDate, orientation_date: august2026CohortDates.orientationDate, matriculation_date: august2026CohortDates.matriculationDate, graduation_date: august2026CohortDates.graduationDate, updated_at: new Date().toISOString() }).eq("id", cohort.id);
  if (cohortUpdate.error) throw new Error(`Cohort dates: ${cohortUpdate.error.message}`);

  if (missingAssignments.length) {
    const assignmentInsert = await supabase.from("facilitator_course_assignments").insert(missingAssignments).select("id, facilitator_id, cohort_course_id, assignment_role");
    if (assignmentInsert.error) throw new Error(`Facilitator assignments: ${assignmentInsert.error.message}`);
    const audit = await supabase.from("audit_logs").insert(assignmentInsert.data.map((item) => ({ action: "facilitator_assigned_to_course", entity_type: "facilitator", entity_id: item.facilitator_id, metadata: { assignment_id: item.id, cohort_course_id: item.cohort_course_id, assignment_role: item.assignment_role, source: "next_5_august_2026_calendar" } })));
    if (audit.error) throw new Error(`Facilitator assignment audit: ${audit.error.message}`);
  }

  const createdSessionIds = [];
  for (const item of missingSessions) {
    const desired = item.desired;
    const facilitatorId = desired.facilitatorName ? facilitatorByName.get(desired.facilitatorName).id : null;
    const inserted = await supabase.from("class_sessions").insert({ cohort_course_id: item.offering.id, title: desired.title, description: desired.description, session_number: desired.sessionNumber, session_type: desired.sessionType, delivery_mode: desired.deliveryMode, scheduled_start_at: desired.scheduledStartAt, scheduled_end_at: desired.scheduledEndAt, timezone: desired.timezone, facilitator_id: facilitatorId, live_join_url: null, physical_location: desired.physicalLocation, session_status: desired.sessionStatus, is_required: desired.isRequired, visibility_status: desired.visibilityStatus }).select("id").single();
    if (inserted.error) throw new Error(`${desired.courseCode} session ${desired.sessionNumber}: ${inserted.error.message}`);
    createdSessionIds.push(inserted.data.id);
    const audit = await supabase.from("audit_logs").insert({ action: "class_session_created", entity_type: "class_session", entity_id: inserted.data.id, metadata: { cohort_course_id: item.offering.id, session_number: desired.sessionNumber, session_type: desired.sessionType, source: "next_5_august_2026_calendar" } });
    if (audit.error) throw new Error(`Session audit: ${audit.error.message}`);
  }

  let orientationCreated = false;
  if (!existingEvent) {
    const inserted = await supabase.from("cohort_events").insert({ cohort_id: cohort.id, event_key: august2026Orientation.eventKey, event_type: august2026Orientation.eventType, title: august2026Orientation.title, description: august2026Orientation.description, scheduled_start_at: august2026Orientation.scheduledStartAt, scheduled_end_at: august2026Orientation.scheduledEndAt, timezone: august2026Orientation.timezone, delivery_mode: august2026Orientation.deliveryMode, live_join_url: null, physical_location: null, event_status: august2026Orientation.eventStatus, visibility_status: august2026Orientation.visibilityStatus, is_required: august2026Orientation.isRequired }).select("id").single();
    if (inserted.error) throw new Error(`Orientation event: ${inserted.error.message}`);
    orientationCreated = true;
    const audit = await supabase.from("audit_logs").insert({ action: "cohort_event_created", entity_type: "cohort_event", entity_id: inserted.data.id, metadata: { cohort_id: cohort.id, event_key: august2026Orientation.eventKey, source: "next_5_august_2026_calendar" } });
    if (audit.error) throw new Error(`Orientation audit: ${audit.error.message}`);
  }
  console.log(JSON.stringify({ ...report, applied: { sessionsCreated: createdSessionIds.length, facilitatorAssignmentsCreated: missingAssignments.length, orientationCreated } }, null, 2));
}
