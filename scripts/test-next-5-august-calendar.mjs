import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  august2026CohortDates,
  august2026CohortEvents,
  august2026Orientation,
  august2026PrayerAndMatriculation,
  august2026PhysicalLocation,
  august2026PreviousGeneratedSessions,
  august2026ScheduleConflicts,
  august2026SessionCounts,
  august2026Sessions,
  august2026Timezone,
} from "../lib/lms/august2026Calendar.ts";
import { cohortCalendarValidationErrors } from "../lib/lms/cohortCalendar.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [seed, migration, dashboard, attendance, lateEntry, results, cohortRecord, cohortRoute, publicCurriculum, publicPage] = await Promise.all([
  read("scripts/setup-august-2026-calendar.mjs"), read("supabase/cohort_calendar_controls.sql"), read("lib/lms/studentDashboard.ts"), read("lib/lms/attendanceService.ts"), read("lib/lms/lateEntry.ts"), read("lib/lms/resultService.ts"), read("components/admin/CohortRecord.tsx"), read("app/api/admin/cohorts/[id]/route.ts"), read("lib/schoolOfDiscoveryCurriculum.ts"), read("app/schools/discovery/page.tsx"),
]);

let passed = 0;
function check(name, fn) { fn(); passed += 1; void name; }
function lagosParts(value) { return Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: august2026Timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); }
const byCode = (code) => august2026Sessions.filter((item) => item.courseCode === code);
const date = (item) => lagosParts(item.scheduledStartAt);
const calendarConfiguration = (overrides = {}) => ({ startDate: null, endDate: null, teachingStartDate: null, teachingEndDate: null, teachingWeekCount: null, completionPeriodStartDate: null, completionPeriodEndDate: null, orientationDate: null, orientationStartAt: null, matriculationDate: null, matriculationStartAt: null, graduationDate: null, graduationStartAt: null, ...overrides });

check("compressed route counts", () => assert.deepEqual(august2026SessionCounts(), { foundational: 21, advanced: 24, web: 14, cyber: 14 }));
check("73 active timetable rows", () => assert.equal(august2026Sessions.length, 73));
check("previous 80-row baseline remains a migration guard", () => assert.equal(august2026PreviousGeneratedSessions.length, 80));
check("session keys remain unique", () => assert.equal(new Set(august2026Sessions.map((item) => `${item.courseCode}:${item.sessionNumber}`)).size, 73));
check("no invented ADV206 or normal capstone sessions", () => { assert.equal(august2026Sessions.some((item) => item.courseCode === "RSD-ADV 206"), false); assert.equal(august2026Sessions.some((item) => item.courseCode.endsWith("190")), false); });
check("authoritative cohort boundaries", () => assert.deepEqual(august2026CohortDates, { startDate: "2026-08-24", endDate: "2026-10-18", teachingStartDate: "2026-08-24", teachingEndDate: "2026-10-11", teachingWeekCount: 7, orientationDate: "2026-08-21", orientationStartAt: null, matriculationDate: "2026-08-23", matriculationStartAt: null, finalCompletionStartDate: "2026-10-12", finalCompletionEndDate: "2026-10-17", graduationDate: "2026-10-18", graduationStartAt: null }));
check("reusable validation accepts the August seven-week calendar", () => assert.deepEqual(cohortCalendarValidationErrors(calendarConfiguration({ startDate: august2026CohortDates.startDate, endDate: august2026CohortDates.endDate, teachingStartDate: august2026CohortDates.teachingStartDate, teachingEndDate: august2026CohortDates.teachingEndDate, teachingWeekCount: august2026CohortDates.teachingWeekCount, completionPeriodStartDate: august2026CohortDates.finalCompletionStartDate, completionPeriodEndDate: august2026CohortDates.finalCompletionEndDate, graduationDate: august2026CohortDates.graduationDate })), []));
check("reusable validation also accepts a future eight-week calendar", () => assert.deepEqual(cohortCalendarValidationErrors(calendarConfiguration({ startDate: "2027-01-04", endDate: "2027-03-07", teachingStartDate: "2027-01-04", teachingEndDate: "2027-02-28", teachingWeekCount: 8, completionPeriodStartDate: "2027-03-01", completionPeriodEndDate: "2027-03-06", graduationDate: "2027-03-07" })), []));
check("reusable validation rejects an overlapping completion period", () => assert.ok(cohortCalendarValidationErrors(calendarConfiguration({ startDate: "2027-01-04", endDate: "2027-03-07", teachingStartDate: "2027-01-04", teachingEndDate: "2027-02-28", teachingWeekCount: 8, completionPeriodStartDate: "2027-02-28", completionPeriodEndDate: "2027-03-06", graduationDate: "2027-03-07" })).length > 0));
check("event timestamps must match their Africa/Lagos event date", () => { assert.deepEqual(cohortCalendarValidationErrors(calendarConfiguration({ orientationDate: "2026-08-21", orientationStartAt: "2026-08-21T18:00:00.000Z" })), []); assert.match(cohortCalendarValidationErrors(calendarConfiguration({ orientationDate: "2026-08-22", orientationStartAt: "2026-08-21T18:00:00.000Z" }))[0], /same date/); });
check("only seven normal teaching weeks", () => assert.deepEqual([...new Set(august2026Sessions.map((item) => item.week))], [1, 2, 3, 4, 5, 6, 7]));
check("all teaching ends before final completion period", () => assert.ok(august2026Sessions.every((item) => Date.parse(item.scheduledEndAt) < Date.parse("2026-10-12T00:00:00+01:00"))));
check("all foundational courses remain represented", () => assert.deepEqual([...new Set(august2026Sessions.filter((item) => item.route === "foundational").map((item) => item.courseCode))], Array.from({ length: 8 }, (_, index) => `RSD-DIS ${101 + index}`)));
check("all web courses remain represented", () => assert.deepEqual([...new Set(august2026Sessions.filter((item) => item.route === "web").map((item) => item.courseCode))], Array.from({ length: 8 }, (_, index) => `RSD-WEB ${101 + index}`)));
check("all cyber courses remain represented", () => assert.deepEqual([...new Set(august2026Sessions.filter((item) => item.route === "cyber").map((item) => item.courseCode))], Array.from({ length: 8 }, (_, index) => `RSD-CYB ${101 + index}`)));
check("all advanced courses remain represented", () => assert.deepEqual([...new Set(august2026Sessions.filter((item) => item.route === "advanced").map((item) => item.courseCode))], Array.from({ length: 5 }, (_, index) => `RSD-ADV ${201 + index}`)));
check("foundational week seven combines DIS107 and DIS108", () => { assert.deepEqual(byCode("RSD-DIS 107").map((item) => date(item).day), ["09", "10"]); assert.deepEqual(byCode("RSD-DIS 108").map((item) => date(item).day), ["11"]); assert.equal(byCode("RSD-DIS 108")[0].sessionType, "assessment"); });
check("web week seven is Monday WEB107 and Tuesday WEB108", () => { assert.deepEqual(byCode("RSD-WEB 107").map((item) => date(item).day), ["05"]); assert.deepEqual(byCode("RSD-WEB 108").map((item) => date(item).day), ["06"]); assert.match(byCode("RSD-WEB 108")[0].description, /WEB190 remains a separate integrated capstone/); });
check("cyber week seven is Wednesday CYB107 and Friday CYB108", () => { assert.deepEqual(byCode("RSD-CYB 107").map((item) => date(item).day), ["07"]); assert.deepEqual(byCode("RSD-CYB 108").map((item) => date(item).day), ["09"]); assert.match(byCode("RSD-CYB 108")[0].description, /CYB190 remains a separate integrated capstone/); });
check("advanced integration stays under ADV205", () => { const integration = byCode("RSD-ADV 205").filter((item) => item.sessionNumber >= 4); assert.equal(integration.length, 3); assert.ok(integration.every((item) => item.week === 7 && item.facilitatorName === null)); });
check("institutional timezone and approved modes remain", () => { assert.ok(august2026Sessions.every((item) => item.timezone === "Africa/Lagos")); assert.ok(august2026Sessions.filter((item) => ["web", "cyber"].includes(item.route)).every((item) => item.deliveryMode === "hybrid" && item.physicalLocation === august2026PhysicalLocation)); });
check("no links or absent event times are invented", () => { assert.ok(august2026Sessions.every((item) => item.liveJoinUrl === null)); assert.equal(august2026Orientation.scheduledStartAt, null); assert.equal(august2026PrayerAndMatriculation.scheduledStartAt, null); });
check("orientation and matriculation dates are separate", () => { assert.equal(august2026CohortEvents.length, 2); assert.equal(august2026Orientation.eventDate, "2026-08-21"); assert.equal(august2026PrayerAndMatriculation.eventDate, "2026-08-23"); });
check("no facilitator overlaps", () => assert.deepEqual(august2026ScheduleConflicts().overlaps, []));
check("dry run and double-confirmed apply", () => { assert.match(seed, /process\.argv\.includes\("--apply"\)/); assert.match(seed, /AUGUST_2026_CALENDAR_APPLY/); assert.match(seed, /mode: apply \? "apply" : "dry-run"/); });
check("script never deletes sessions or changes facilitator assignments", () => { assert.doesNotMatch(seed, /from\("class_sessions"\)\.delete/); assert.doesNotMatch(seed, /from\("facilitator_course_assignments"\)\.(?:insert|update|delete|upsert)/); assert.match(seed, /session_status: "cancelled"/); });
check("script preserves linked history and live-link fields", () => { const managedValues = seed.match(/function managedValues\(desired\) \{[\s\S]*?\n\}/)?.[0] ?? ""; assert.match(seed, /dependenciesPreserved/); assert.doesNotMatch(managedValues, /live_join_url/); assert.match(seed, /liveLinksPreserved: true/); });
check("migration provides reusable cohort controls without data updates", () => { for (const field of ["teaching_start_date", "teaching_end_date", "teaching_week_count", "completion_period_start_date", "completion_period_end_date", "orientation_start_at", "matriculation_start_at", "graduation_start_at"]) assert.match(migration, new RegExp(field)); assert.doesNotMatch(migration, /update\s+public\.cohorts/i); });
check("admin exposes and validates cohort calendar controls", () => { for (const field of ["teaching_start_date", "teaching_end_date", "teaching_week_count", "completion_period_start_date", "completion_period_end_date", "orientation_start_at", "matriculation_start_at", "graduation_start_at"]) { assert.match(cohortRecord, new RegExp(field)); assert.match(cohortRoute, new RegExp(field)); } });
check("cancelled sessions are excluded from attendance and catch-up", () => { assert.match(attendance, /session_status === "cancelled"/); assert.match(lateEntry, /session\.session_status === "cancelled"/); assert.match(results, /neq\("session_status", "cancelled"\)/); });
check("student milestone display supports exact configured times", () => { assert.match(dashboard, /orientation_start_at/); assert.match(dashboard, /matriculation_start_at/); });
check("public copy describes seven teaching weeks and no current week eight", () => { assert.match(publicPage, /seven teaching weeks/i); assert.match(publicPage, /12–17 October/); assert.doesNotMatch(publicPage, /eight-week/i); assert.doesNotMatch(publicCurriculum, /delivery: "Week 8"/); });

assert.equal(passed, 32);
console.log(`August 2026 seven-teaching-week calendar checks passed (${passed}).`);
