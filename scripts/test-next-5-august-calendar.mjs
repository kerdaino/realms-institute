import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  august2026AdditionalFacilitatorAssignments,
  august2026CohortDates,
  august2026Orientation,
  august2026PhysicalLocation,
  august2026ScheduleConflicts,
  august2026SessionCounts,
  august2026Sessions,
  august2026Timezone,
} from "../lib/lms/august2026Calendar.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [seed, migration, dashboard, learning, attendance] = await Promise.all([
  read("scripts/setup-august-2026-calendar.mjs"),
  read("supabase/lms_next_5_august_calendar.sql"),
  read("lib/lms/studentDashboard.ts"),
  read("lib/lms/studentLearning.ts"),
  read("lib/lms/attendanceService.ts"),
]);

let passed = 0;
function check(name, fn) { fn(); passed += 1; }
function lagosParts(value) { return Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: august2026Timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); }

check("exact route counts", () => assert.deepEqual(august2026SessionCounts(), { foundational: 24, advanced: 24, web: 16, cyber: 16 }));
check("exact total core sessions", () => assert.equal(august2026Sessions.length, 80));
check("session keys are unique", () => assert.equal(new Set(august2026Sessions.map((item) => `${item.courseCode}:${item.sessionNumber}`)).size, 80));
check("no new or capstone teaching codes", () => { assert.equal(august2026Sessions.some((item) => item.courseCode === "RSD-ADV 206"), false); assert.equal(august2026Sessions.some((item) => item.courseCode.endsWith("190")), false); });
check("master dates remain exact", () => assert.deepEqual(august2026CohortDates, { startDate: "2026-08-24", endDate: "2026-10-25", orientationDate: "2026-08-21", matriculationDate: "2026-08-21", finalCompletionStartDate: "2026-10-19", finalCompletionEndDate: "2026-10-24", graduationDate: "2026-10-25", graduationTime: null }));
check("all timestamps use the institutional timezone", () => assert.ok(august2026Sessions.every((item) => item.timezone === "Africa/Lagos")));
check("foundational WAT times are correct", () => { const sessions = august2026Sessions.filter((item) => item.route === "foundational"); assert.equal(sessions.filter((item) => lagosParts(item.scheduledStartAt).hour === "18" && lagosParts(item.scheduledStartAt).minute === "30").length, 16); assert.equal(sessions.filter((item) => lagosParts(item.scheduledStartAt).hour === "20" && lagosParts(item.scheduledStartAt).minute === "00").length, 8); });
check("advanced WAT times are correct", () => assert.ok(august2026Sessions.filter((item) => item.route === "advanced").every((item) => lagosParts(item.scheduledStartAt).hour === "19" && lagosParts(item.scheduledEndAt).hour === "21")));
check("skill WAT times are correct", () => assert.ok(august2026Sessions.filter((item) => item.route === "web" || item.route === "cyber").every((item) => lagosParts(item.scheduledStartAt).hour === "15" && lagosParts(item.scheduledStartAt).minute === "30" && lagosParts(item.scheduledEndAt).hour === "18")));
check("discipleship is online", () => assert.ok(august2026Sessions.filter((item) => item.route === "foundational" || item.route === "advanced").every((item) => item.deliveryMode === "online" && item.physicalLocation === null)));
check("skills use approved hybrid delivery and exact location", () => assert.ok(august2026Sessions.filter((item) => item.route === "web" || item.route === "cyber").every((item) => item.deliveryMode === "hybrid" && item.physicalLocation === august2026PhysicalLocation)));
check("no meeting links are invented", () => assert.ok(august2026Sessions.every((item) => item.liveJoinUrl === null) && august2026Orientation.liveJoinUrl === null));
check("foundational facilitators match the register", () => { const expected = { "RSD-DIS 101": "Pastor Arome Iduh", "RSD-DIS 102": "Pastor Arome Iduh", "RSD-DIS 103": "Otache Imanche", "RSD-DIS 104": "Pastor Onyeka", "RSD-DIS 105": "Minister Daniel", "RSD-DIS 106": "Minister Daniel", "RSD-DIS 107": "Oluwatobi Adekunle", "RSD-DIS 108": "REALMS Faculty Team" }; for (const item of august2026Sessions.filter((row) => row.route === "foundational")) assert.equal(item.facilitatorName, expected[item.courseCode]); });
check("week eight coordination reuses the approved co-facilitator", () => assert.deepEqual(august2026AdditionalFacilitatorAssignments, [{ courseCode: "RSD-DIS 108", facilitatorName: "Oluwatobi Adekunle", assignmentRole: "co_facilitator" }]));
check("advanced primary facilitators match and week eight stays pending", () => { assert.ok(august2026Sessions.filter((item) => item.route === "advanced" && item.week < 8).every((item) => item.facilitatorName === ({ "RSD-ADV 201": "Pastor Arome Iduh", "RSD-ADV 202": "Pastor Arome Iduh", "RSD-ADV 203": "Pastor Arome Iduh", "RSD-ADV 204": "Minister Daniel", "RSD-ADV 205": "Oluwatobi Adekunle" })[item.courseCode])); assert.ok(august2026Sessions.filter((item) => item.route === "advanced" && item.week === 8).every((item) => item.courseCode === "RSD-ADV 205" && item.facilitatorName === null)); });
check("all skill sessions use the approved facilitator", () => assert.ok(august2026Sessions.filter((item) => item.route === "web" || item.route === "cyber").every((item) => item.facilitatorName === "Oluwatobi Adekunle")));
check("final week and graduation have no invented sessions", () => assert.ok(august2026Sessions.every((item) => Date.parse(item.scheduledStartAt) < Date.parse("2026-10-19T00:00:00+01:00"))));
check("orientation is one non-course cohort event", () => { assert.equal(lagosParts(august2026Orientation.scheduledStartAt).hour, "19"); assert.equal(august2026Orientation.scheduledEndAt, null); assert.equal(august2026Orientation.isRequired, true); assert.match(august2026Orientation.description, /no academic mark/); });
check("the schedule has no facilitator overlaps", () => assert.deepEqual(august2026ScheduleConflicts().overlaps, []));
check("tight transitions are surfaced", () => assert.ok(august2026ScheduleConflicts().tightTransitions.some((item) => item.minutes === 30 && item.facilitator === "Oluwatobi Adekunle")));
check("seed is dry-run first and double-confirmed for apply", () => { assert.match(seed, /process\.argv\.includes\("--apply"\)/); assert.match(seed, /NEXT_5_APPLY/); assert.match(seed, /mode: apply \? "apply" : "dry-run"/); });
check("seed never creates courses, offerings or identities", () => { assert.doesNotMatch(seed, /from\("courses"\)\.insert/); assert.doesNotMatch(seed, /from\("cohort_courses"\)\.insert/); assert.doesNotMatch(seed, /from\("facilitators"\)\.insert/); });
check("seed blocks conflicting existing session keys", () => { assert.match(seed, /conflictingSessions/); assert.match(seed, /manual review before setup/); });
check("cohort events use timestamptz and student-owned RLS", () => { assert.match(migration, /scheduled_start_at timestamptz/); assert.match(migration, /students read enrolled cohort events/); assert.match(migration, /students\.profile_id = auth\.uid\(\)/); });
check("students see only enrolled offerings and their cohort events", () => { assert.match(dashboard, /course_enrollments/); assert.match(dashboard, /cohort_events/); assert.match(dashboard, /eq\("cohort_id", enrollment\.cohort_id\)/); });
check("approved delivery route controls skill presentation", () => { assert.match(dashboard, /deliveryRoute === "PL"/); assert.match(learning, /course\.deliveryRoute === "PL"/); });
check("attendance remains session and enrollment based", () => { assert.doesNotMatch(seed, /from\("session_attendance"\)\.(?:insert|update|upsert|delete)/); assert.match(attendance, /class_session_id/); assert.match(attendance, /course_enrollment_id/); });

assert.equal(passed, 27);
console.log(`NEXT 5 August calendar checks passed (${passed}).`);
