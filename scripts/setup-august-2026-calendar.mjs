import { createClient } from "@supabase/supabase-js";

import {
  august2026AdditionalFacilitatorAssignments,
  august2026CohortEvents,
  august2026CohortCode,
  august2026CohortDates,
  august2026PreviousGeneratedSessions,
  august2026ScheduleConflicts,
  august2026SessionCounts,
  august2026Sessions,
} from "../lib/lms/august2026Calendar.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase administrative environment variables are required.");

const apply = process.argv.includes("--apply");
const summaryOnly = process.argv.includes("--summary");
if (apply && process.env.AUGUST_2026_CALENDAR_APPLY !== "1") throw new Error("Set AUGUST_2026_CALENDAR_APPLY=1 as well as --apply before rescheduling the production calendar.");
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function relation(value) { return Array.isArray(value) ? value[0] ?? {} : value ?? {}; }
function sameTimestamp(a, b) { return a && b && new Date(a).toISOString() === new Date(b).toISOString(); }
function sessionKey(code, sessionNumber) { return `${code}:${sessionNumber}`; }
function courseCode(row) { return relation(relation(row.cohort_courses).courses).code; }
function desiredKey(item) { return sessionKey(item.courseCode, item.sessionNumber); }
function canSafelyChange(row) { return ["scheduled", "rescheduled"].includes(row.session_status) && !row.actual_start_at && !row.actual_end_at; }
function managedSessionMatches(current, desired) {
  return current.title === desired.title
    && current.description === desired.description
    && current.session_type === desired.sessionType
    && current.delivery_mode === desired.deliveryMode
    && sameTimestamp(current.scheduled_start_at, desired.scheduledStartAt)
    && sameTimestamp(current.scheduled_end_at, desired.scheduledEndAt)
    && current.timezone === desired.timezone
    && (current.physical_location ?? null) === desired.physicalLocation
    && Boolean(current.is_required) === desired.isRequired;
}
function managedValues(desired) {
  return {
    title: desired.title,
    description: desired.description,
    session_type: desired.sessionType,
    delivery_mode: desired.deliveryMode,
    scheduled_start_at: desired.scheduledStartAt,
    scheduled_end_at: desired.scheduledEndAt,
    timezone: desired.timezone,
    physical_location: desired.physicalLocation,
    is_required: desired.isRequired,
  };
}
function lagosTimeOnDate(timestamp, date) {
  if (!timestamp) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(timestamp)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return new Date(`${date}T${parts.hour}:${parts.minute}:${parts.second}+01:00`).toISOString();
}
async function dependencyCountsForSessions(sessionIds) {
  if (!sessionIds.length) return new Map();
  const dependencyTables = [
    ["session_attendance", "class_session_id"], ["session_learning_completion", "class_session_id"], ["absence_requests", "class_session_id"], ["makeup_requirements", "class_session_id"],
    ["class_summaries", "class_session_id"], ["class_recordings", "class_session_id"], ["session_resources", "class_session_id"], ["session_recording_requirements", "class_session_id"],
  ];
  const results = await Promise.all(dependencyTables.map(([table, column]) => supabase.from(table).select(`id, ${column}`).in(column, sessionIds)));
  const countsBySession = new Map(sessionIds.map((id) => [id, {}]));
  for (let index = 0; index < dependencyTables.length; index += 1) {
    const [table, column] = dependencyTables[index]; const result = results[index];
    if (result.error && !["42P01", "42703", "PGRST204", "PGRST205"].includes(result.error.code ?? "")) throw new Error(`Dependency check ${table}: ${result.error.message}`);
    for (const sessionId of sessionIds) countsBySession.get(sessionId)[table] = result.error ? "migration-unavailable" : (result.data ?? []).filter((row) => row[column] === sessionId).length;
  }
  return countsBySession;
}

const cohortResult = await supabase.from("cohorts").select("*").eq("code", august2026CohortCode);
if (cohortResult.error) throw new Error(`Cohort lookup: ${cohortResult.error.message}`);
if (cohortResult.data.length !== 1) throw new Error(`Expected exactly one ${august2026CohortCode} cohort.`);
const cohort = cohortResult.data[0];

const offeringIdsResult = await supabase.from("cohort_courses").select("id").eq("cohort_id", cohort.id);
if (offeringIdsResult.error) throw new Error(`Offering identifiers: ${offeringIdsResult.error.message}`);
const offeringIds = offeringIdsResult.data.map((item) => item.id);
const [offeringResult, facilitatorResult, assignmentResult, sessionResult, eventProbe] = await Promise.all([
  supabase.from("cohort_courses").select("id, course_id, delivery_mode, schedule_text, status, courses(id, code, title)").eq("cohort_id", cohort.id),
  supabase.from("facilitators").select("id, display_name, facilitator_status").eq("facilitator_status", "active"),
  supabase.from("facilitator_course_assignments").select("id, facilitator_id, cohort_course_id, assignment_role, facilitators(display_name)").in("cohort_course_id", offeringIds),
  supabase.from("class_sessions").select("id, cohort_course_id, title, description, session_number, session_type, delivery_mode, scheduled_start_at, scheduled_end_at, actual_start_at, actual_end_at, timezone, live_join_url, physical_location, session_status, visibility_status, is_required, facilitator_id, cohort_courses!inner(cohort_id,courses(code,title))").eq("cohort_courses.cohort_id", cohort.id).order("scheduled_start_at", { ascending: true }),
  supabase.from("cohort_events").select("*").eq("cohort_id", cohort.id),
]);
for (const [label, result] of [["Offerings", offeringResult], ["Facilitators", facilitatorResult], ["Assignments", assignmentResult], ["Sessions", sessionResult]]) if (result.error) throw new Error(`${label}: ${result.error.message}`);
const eventTableMissing = Boolean(eventProbe.error && (["42P01", "42703", "PGRST204", "PGRST205"].includes(eventProbe.error.code ?? "") || /cohort_events|event_date/i.test(eventProbe.error.message)));
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
  const row = { facilitator_id: facilitatorByName.get(item.facilitatorName).id, cohort_course_id: offeringByCode.get(item.courseCode).id, assignment_role: "lead", facilitatorName: item.facilitatorName, courseCode: item.courseCode };
  if (!desiredAssignments.some((current) => current.facilitator_id === row.facilitator_id && current.cohort_course_id === row.cohort_course_id)) desiredAssignments.push(row);
}
for (const item of august2026AdditionalFacilitatorAssignments) {
  const facilitator = facilitatorByName.get(item.facilitatorName);
  const offering = offeringByCode.get(item.courseCode);
  if (!facilitator || !offering) continue;
  const row = { facilitator_id: facilitator.id, cohort_course_id: offering.id, assignment_role: item.assignmentRole, facilitatorName: item.facilitatorName, courseCode: item.courseCode };
  if (!desiredAssignments.some((current) => current.facilitator_id === row.facilitator_id && current.cohort_course_id === row.cohort_course_id && current.assignment_role === row.assignment_role)) desiredAssignments.push(row);
}
const existingAssignmentKeys = new Set(assignmentResult.data.map((item) => `${item.facilitator_id}:${item.cohort_course_id}:${item.assignment_role}`));
const missingExpectedAssignments = desiredAssignments.filter((item) => !existingAssignmentKeys.has(`${item.facilitator_id}:${item.cohort_course_id}:${item.assignment_role}`));

const rowsByKey = new Map();
for (const row of sessionResult.data) {
  const key = sessionKey(courseCode(row), row.session_number);
  const list = rowsByKey.get(key) ?? [];
  list.push(row); rowsByKey.set(key, list);
}
const duplicateSessions = [...rowsByKey.entries()].filter(([, rows]) => rows.length > 1).map(([key, rows]) => ({ key, ids: rows.map((row) => row.id), titles: rows.map((row) => row.title) }));
const desiredByKey = new Map(august2026Sessions.map((item) => [desiredKey(item), item]));
const previousByKey = new Map(august2026PreviousGeneratedSessions.map((item) => [desiredKey(item), item]));
const unchangedSessions = [];
const changedSessions = [];
const missingSessions = [];
const conflictingSessions = [];
for (const desired of august2026Sessions) {
  const key = desiredKey(desired);
  const rows = rowsByKey.get(key) ?? [];
  if (rows.length !== 1) {
    if (!rows.length) missingSessions.push({ key, desired, offering: offeringByCode.get(desired.courseCode) });
    continue;
  }
  const current = rows[0];
  if (managedSessionMatches(current, desired)) unchangedSessions.push({ key, current, desired });
  else if (previousByKey.has(key) && managedSessionMatches(current, previousByKey.get(key)) && canSafelyChange(current)) changedSessions.push({ key, current, desired, moved: !sameTimestamp(current.scheduled_start_at, desired.scheduledStartAt) || !sameTimestamp(current.scheduled_end_at, desired.scheduledEndAt) });
  else conflictingSessions.push({ key, id: current.id, existingTitle: current.title, desiredTitle: desired.title, existingStartAt: current.scheduled_start_at, desiredStartAt: desired.scheduledStartAt, sessionStatus: current.session_status, actualStartAt: current.actual_start_at, actualEndAt: current.actual_end_at, reason: previousByKey.has(key) ? "record no longer matches the previous generated baseline or has started" : "session key was not in the previous generated baseline" });
}

const obsoleteSessions = [];
const obsoleteAlreadyCancelled = [];
for (const [key, previous] of previousByKey) {
  if (desiredByKey.has(key)) continue;
  const rows = rowsByKey.get(key) ?? [];
  if (rows.length !== 1) continue;
  const current = rows[0];
  if (current.session_status === "cancelled") obsoleteAlreadyCancelled.push({ key, current });
  else if (managedSessionMatches(current, previous) && canSafelyChange(current)) obsoleteSessions.push({ key, current, previous, dependencies: {} });
  else conflictingSessions.push({ key, id: current.id, existingTitle: current.title, desiredTitle: null, existingStartAt: current.scheduled_start_at, desiredStartAt: null, sessionStatus: current.session_status, actualStartAt: current.actual_start_at, actualEndAt: current.actual_end_at, reason: "obsolete generated session has changed or started and cannot be cancelled automatically" });
}
const obsoleteDependencyCounts = await dependencyCountsForSessions(obsoleteSessions.map((item) => item.current.id));
for (const item of obsoleteSessions) item.dependencies = obsoleteDependencyCounts.get(item.current.id) ?? {};
const managedKeys = new Set([...desiredByKey.keys(), ...previousByKey.keys()]);
const unmanagedSessions = sessionResult.data.filter((row) => !managedKeys.has(sessionKey(courseCode(row), row.session_number))).map((row) => ({ id: row.id, courseCode: courseCode(row), sessionNumber: row.session_number, title: row.title, status: row.session_status }));

const legacyEventKeys = {
  orientation: ["orientation-2026-08-14", "orientation-matriculation-2026-08-21"],
  prayer_matriculation: ["prayer-matriculation-2026-08-16"],
};
const cohortEventChanges = eventTableMissing ? [] : august2026CohortEvents.map((desired) => {
  const current = eventProbe.data.find((item) => item.event_key === desired.eventKey)
    ?? eventProbe.data.find((item) => (legacyEventKeys[desired.eventType] ?? []).includes(item.event_key))
    ?? eventProbe.data.find((item) => item.event_type === desired.eventType)
    ?? null;
  const preservedStartAt = current?.scheduled_start_at ? lagosTimeOnDate(current.scheduled_start_at, desired.eventDate) : null;
  const resultingStartAt = preservedStartAt ?? desired.scheduledStartAt;
  const matches = current && current.event_key === desired.eventKey && current.event_type === desired.eventType && current.title === desired.title && current.event_date === desired.eventDate && ((resultingStartAt && sameTimestamp(current.scheduled_start_at, resultingStartAt)) || (!resultingStartAt && current.scheduled_start_at === null));
  return { desired, current, resultingStartAt, action: matches ? "matches" : current ? "update" : "create", approvedTimePreserved: Boolean(preservedStartAt), timeRequiresAdminConfiguration: !resultingStartAt };
});

const orientationChange = cohortEventChanges.find((item) => item.desired.eventType === "orientation");
const matriculationChange = cohortEventChanges.find((item) => item.desired.eventType === "prayer_matriculation");
const cohortCalendarMigrationRequired = ["teaching_start_date", "teaching_end_date", "completion_period_start_date", "completion_period_end_date", "teaching_week_count", "orientation_start_at", "matriculation_start_at", "graduation_start_at"].some((field) => !(field in cohort));
const calendarConflicts = august2026ScheduleConflicts();
const resultingTimetable = august2026Sessions.map((item) => ({ route: item.route, week: item.week, courseCode: item.courseCode, sessionNumber: item.sessionNumber, title: item.title, startAt: item.scheduledStartAt, endAt: item.scheduledEndAt, facilitator: item.facilitatorName }));
const report = {
  mode: apply ? "apply" : "dry-run",
  productionChangesExecuted: false,
  cohort: {
    id: cohort.id, code: cohort.code,
    currentDates: { startDate: cohort.start_date, endDate: cohort.end_date, teachingStartDate: cohort.teaching_start_date, teachingEndDate: cohort.teaching_end_date, teachingWeekCount: cohort.teaching_week_count, completionPeriodStartDate: cohort.completion_period_start_date, completionPeriodEndDate: cohort.completion_period_end_date, orientationDate: cohort.orientation_date, orientationStartAt: cohort.orientation_start_at, matriculationDate: cohort.matriculation_date, matriculationStartAt: cohort.matriculation_start_at, graduationDate: cohort.graduation_date, graduationStartAt: cohort.graduation_start_at },
    desiredDates: { ...august2026CohortDates, orientationStartAt: orientationChange?.resultingStartAt ?? null, matriculationStartAt: matriculationChange?.resultingStartAt ?? null },
    calendarMigrationRequired: cohortCalendarMigrationRequired,
  },
  sessionInventory: {
    currentSessionCount: sessionResult.data.length,
    currentActiveSessionCount: sessionResult.data.filter((row) => row.session_status !== "cancelled").length,
    desiredActiveSessionCount: august2026Sessions.length,
    desiredByRoute: august2026SessionCounts(),
    sessionsUnchanged: unchangedSessions.length,
    sessionsUpdated: changedSessions.length,
    sessionsMoved: changedSessions.filter((item) => item.moved).length,
    sessionsCreated: missingSessions.length,
    obsoleteSessionsToCancel: obsoleteSessions.length,
    obsoleteSessionsAlreadyCancelled: obsoleteAlreadyCancelled.length,
    unmanagedSessionsPreserved: unmanagedSessions,
    duplicateSessions,
    conflicts: conflictingSessions,
  },
  weekSevenCombinedCourseSessions: resultingTimetable.filter((item) => item.week === 7 && ["RSD-DIS 107", "RSD-DIS 108", "RSD-WEB 107", "RSD-WEB 108", "RSD-CYB 107", "RSD-CYB 108"].includes(item.courseCode)),
  obsoleteSchedulingOnly: obsoleteSessions.map((item) => ({ id: item.current.id, key: item.key, title: item.current.title, startAt: item.current.scheduled_start_at, dependenciesPreserved: item.dependencies })),
  catalogue: { requiredCourses: requiredCourseCodes.length, existingOfferings: offeringResult.data.length, coursesOrOfferingsCreated: 0, missingCoursesOrOfferings, missingFacilitators },
  facilitatorAssignments: { current: assignmentResult.data.length, changed: 0, missingExpectedAssignments: missingExpectedAssignments.map(({ facilitatorName, courseCode, assignment_role }) => ({ facilitatorName, courseCode, assignmentRole: assignment_role })), note: "The script does not create, remove or reassign facilitator assignments." },
  cohortEvents: { migrationRequired: eventTableMissing, changes: cohortEventChanges.map((item) => ({ eventKey: item.desired.eventKey, action: item.action, approvedTimePreserved: item.approvedTimePreserved, timeRequiresAdminConfiguration: item.timeRequiresAdminConfiguration, resultingStartAt: item.resultingStartAt })) },
  scheduleReview: calendarConflicts,
  protections: { liveLinksPreserved: true, facilitatorAssignmentsPreserved: true, assessmentRecordsUntouched: true, attendanceRecordsUntouched: true, sessionHistoryDeleted: false, cancelledRowsExcludedFromAttendanceAndCatchup: true },
  resultingTimetable,
};

const blockingConflicts = conflictingSessions.length || duplicateSessions.length || calendarConflicts.overlaps.length;
if (!apply) {
  const output = summaryOnly ? {
    ...report,
    weekSevenCombinedCourseSessions: { count: report.weekSevenCombinedCourseSessions.length, sessions: report.weekSevenCombinedCourseSessions },
    resultingTimetable: {
      count: resultingTimetable.length,
      byRoute: august2026SessionCounts(),
      firstSession: resultingTimetable[0] ?? null,
      finalSession: resultingTimetable.at(-1) ?? null,
    },
  } : report;
  console.log(JSON.stringify(output, null, 2));
  if (blockingConflicts) process.exitCode = 2;
} else {
  if (cohortCalendarMigrationRequired) throw new Error("Apply supabase/cohort_calendar_controls.sql before running the calendar reschedule apply.");
  if (eventTableMissing) throw new Error("Apply the cohort-events migration before running the calendar reschedule apply.");
  if (blockingConflicts) throw new Error(`Calendar records require manual review before apply: ${JSON.stringify({ conflictingSessions, duplicateSessions, overlaps: calendarConflicts.overlaps })}`);

  const cohortUpdate = await supabase.from("cohorts").update({
    start_date: august2026CohortDates.startDate, end_date: august2026CohortDates.endDate,
    teaching_start_date: august2026CohortDates.teachingStartDate, teaching_end_date: august2026CohortDates.teachingEndDate, teaching_week_count: august2026CohortDates.teachingWeekCount,
    completion_period_start_date: august2026CohortDates.finalCompletionStartDate, completion_period_end_date: august2026CohortDates.finalCompletionEndDate,
    orientation_date: august2026CohortDates.orientationDate, orientation_start_at: orientationChange?.resultingStartAt ?? null,
    matriculation_date: august2026CohortDates.matriculationDate, matriculation_start_at: matriculationChange?.resultingStartAt ?? null,
    graduation_date: august2026CohortDates.graduationDate, graduation_start_at: august2026CohortDates.graduationStartAt,
    updated_at: new Date().toISOString(),
  }).eq("id", cohort.id);
  if (cohortUpdate.error) throw new Error(`Cohort calendar: ${cohortUpdate.error.message}`);

  const updatedSessionIds = [];
  for (const item of changedSessions) {
    const updated = await supabase.from("class_sessions").update(managedValues(item.desired)).eq("id", item.current.id).eq("title", item.current.title).eq("scheduled_start_at", item.current.scheduled_start_at).eq("session_status", item.current.session_status).select("id").maybeSingle();
    if (updated.error || !updated.data) throw new Error(`${item.key} changed during the safe apply.`);
    updatedSessionIds.push(updated.data.id);
    const audit = await supabase.from("audit_logs").insert({ action: "class_session_rescheduled", entity_type: "class_session", entity_id: item.current.id, metadata: { previous_title: item.current.title, title: item.desired.title, previous_start_at: item.current.scheduled_start_at, scheduled_start_at: item.desired.scheduledStartAt, source: "august_2026_seven_teaching_week_revision" } });
    if (audit.error) throw new Error(`Session reschedule audit: ${audit.error.message}`);
  }

  const createdSessionIds = [];
  for (const item of missingSessions) {
    const desired = item.desired;
    const facilitatorId = desired.facilitatorName ? facilitatorByName.get(desired.facilitatorName).id : null;
    const inserted = await supabase.from("class_sessions").insert({ cohort_course_id: item.offering.id, ...managedValues(desired), session_number: desired.sessionNumber, facilitator_id: facilitatorId, live_join_url: null, session_status: desired.sessionStatus, visibility_status: desired.visibilityStatus }).select("id").single();
    if (inserted.error) throw new Error(`${item.key}: ${inserted.error.message}`);
    createdSessionIds.push(inserted.data.id);
    const audit = await supabase.from("audit_logs").insert({ action: "class_session_created", entity_type: "class_session", entity_id: inserted.data.id, metadata: { cohort_course_id: item.offering.id, session_number: desired.sessionNumber, source: "august_2026_seven_teaching_week_revision" } });
    if (audit.error) throw new Error(`Session creation audit: ${audit.error.message}`);
  }

  const cancelledSessionIds = [];
  for (const item of obsoleteSessions) {
    const updated = await supabase.from("class_sessions").update({ session_status: "cancelled" }).eq("id", item.current.id).eq("title", item.current.title).eq("scheduled_start_at", item.current.scheduled_start_at).eq("session_status", item.current.session_status).is("actual_start_at", null).select("id").maybeSingle();
    if (updated.error || !updated.data) throw new Error(`${item.key} changed during the safe cancellation.`);
    cancelledSessionIds.push(updated.data.id);
    const audit = await supabase.from("audit_logs").insert({ action: "class_session_rescheduled", entity_type: "class_session", entity_id: item.current.id, metadata: { previous_status: item.current.session_status, session_status: "cancelled", reason: "Obsolete timetable row after approved seven-teaching-week compression; linked history preserved.", dependencies: item.dependencies, source: "august_2026_seven_teaching_week_revision" } });
    if (audit.error) throw new Error(`Obsolete-session audit: ${audit.error.message}`);
  }

  const changedEventIds = [];
  for (const item of cohortEventChanges.filter((event) => event.action !== "matches")) {
    const values = { cohort_id: cohort.id, event_key: item.desired.eventKey, event_type: item.desired.eventType, title: item.desired.title, description: item.desired.description, event_date: item.desired.eventDate, scheduled_start_at: item.resultingStartAt, scheduled_end_at: item.desired.scheduledEndAt, timezone: item.desired.timezone, delivery_mode: item.desired.deliveryMode, physical_location: item.desired.physicalLocation, event_status: item.desired.eventStatus, visibility_status: item.desired.visibilityStatus, is_required: item.desired.isRequired };
    const saved = item.current ? await supabase.from("cohort_events").update(values).eq("id", item.current.id).select("id").single() : await supabase.from("cohort_events").insert({ ...values, live_join_url: null }).select("id").single();
    if (saved.error) throw new Error(`${item.desired.title}: ${saved.error.message}`);
    changedEventIds.push(saved.data.id);
    const audit = await supabase.from("audit_logs").insert({ action: item.current ? "cohort_event_rescheduled" : "cohort_event_created", entity_type: "cohort_event", entity_id: saved.data.id, metadata: { cohort_id: cohort.id, event_key: item.desired.eventKey, approved_time_preserved: item.approvedTimePreserved, source: "august_2026_seven_teaching_week_revision" } });
    if (audit.error) throw new Error(`Cohort event audit: ${audit.error.message}`);
  }
  console.log(JSON.stringify({ ...report, productionChangesExecuted: true, applied: { sessionsUpdated: updatedSessionIds.length, sessionsCreated: createdSessionIds.length, obsoleteSessionsCancelled: cancelledSessionIds.length, facilitatorAssignmentsChanged: 0, cohortEventsChanged: changedEventIds.length } }, null, 2));
}
