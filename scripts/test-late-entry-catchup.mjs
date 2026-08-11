import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { lateEntryCatchupDeadline, lateEntryCatchupDisplayStatus, missedRequiredLateEntrySessions } from "../lib/lms/lateEntry.ts";

const enrolledAt = "2026-08-10T12:00:00.000Z";
const offerings = new Set(["web", "disc"]);
const sessions = [
  { id: "required-before", cohort_course_id: "web", is_required: true, session_status: "completed", scheduled_start_at: "2026-08-08T10:00:00.000Z", scheduled_end_at: "2026-08-08T12:00:00.000Z" },
  { id: "required-after", cohort_course_id: "web", is_required: true, session_status: "scheduled", scheduled_start_at: "2026-08-11T10:00:00.000Z", scheduled_end_at: "2026-08-11T12:00:00.000Z" },
  { id: "other-path", cohort_course_id: "other", is_required: true, session_status: "completed", scheduled_start_at: "2026-08-08T10:00:00.000Z", scheduled_end_at: "2026-08-08T12:00:00.000Z" },
  { id: "optional", cohort_course_id: "disc", is_required: false, session_status: "completed", scheduled_start_at: "2026-08-08T10:00:00.000Z", scheduled_end_at: "2026-08-08T12:00:00.000Z" },
  { id: "cancelled", cohort_course_id: "disc", is_required: true, session_status: "cancelled", scheduled_start_at: "2026-08-08T10:00:00.000Z", scheduled_end_at: "2026-08-08T12:00:00.000Z" },
];

assert.deepEqual(missedRequiredLateEntrySessions(sessions, offerings, enrolledAt).map((item) => item.id), ["required-before"]);
assert.equal(lateEntryCatchupDeadline(enrolledAt), "2026-08-17T12:00:00.000Z");
assert.equal(lateEntryCatchupDisplayStatus({ makeup_status: "assigned", due_at: "2026-08-17T12:00:00.000Z" }, new Date("2026-08-11T00:00:00.000Z")), "Pending");
assert.equal(lateEntryCatchupDisplayStatus({ makeup_status: "in_progress", due_at: "2026-08-17T12:00:00.000Z" }, new Date("2026-08-11T00:00:00.000Z")), "In Progress");
assert.equal(lateEntryCatchupDisplayStatus({ makeup_status: "awaiting_practical", evidenceSubmitted: true, due_at: "2026-08-17T12:00:00.000Z" }, new Date("2026-08-11T00:00:00.000Z")), "Submitted");
assert.equal(lateEntryCatchupDisplayStatus({ makeup_status: "under_review", evidenceSubmitted: true, due_at: "2026-08-17T12:00:00.000Z" }, new Date("2026-08-11T00:00:00.000Z")), "Under Review");
assert.equal(lateEntryCatchupDisplayStatus({ makeup_status: "alternative_required", due_at: "2026-08-17T12:00:00.000Z" }, new Date("2026-08-11T00:00:00.000Z")), "Alternative Required");
assert.equal(lateEntryCatchupDisplayStatus({ makeup_status: "completed", due_at: "2026-08-17T12:00:00.000Z" }, new Date("2026-08-18T00:00:00.000Z")), "Completed");
assert.equal(lateEntryCatchupDisplayStatus({ makeup_status: "in_progress", due_at: "2026-08-17T12:00:00.000Z" }, new Date("2026-08-18T00:00:00.000Z")), "Catch-Up Overdue");

const files = Object.fromEntries(await Promise.all([
  "lib/lms/provisionStudent.ts",
  "lib/lms/attendanceService.ts",
  "lib/lms/lateEntryService.server.ts",
  "lib/lms/absenceService.ts",
  "lib/lms/facilitatorSessions.ts",
  "lib/lms/studentLearning.ts",
  "app/api/student/sessions/[sessionId]/join/route.ts",
  "supabase/lms_late_entry_catchup.sql",
].map(async (path) => [path, await readFile(new URL(`../${path}`, import.meta.url), "utf8")])));

assert.match(files["lib/lms/provisionStudent.ts"], /ensureLateEntryCatchupPlan/);
assert.match(files["lib/lms/attendanceService.ts"], /student_enrollments\(enrolled_at\)/);
assert.match(files["lib/lms/attendanceService.ts"], /lateEntryExcluded/);
assert.match(files["lib/lms/lateEntryService.server.ts"], /purpose: "LE-C"/);
assert.match(files["lib/lms/lateEntryService.server.ts"], /ensureMakeupRequirement/);
assert.match(files["lib/lms/absenceService.ts"], /alternative_required/);
assert.match(files["lib/lms/absenceService.ts"], /purpose !== "LE-C".*sendMakeupEmail/);
assert.doesNotMatch(files["lib/lms/lateEntryService.server.ts"], /withdraw|student_status.*withdraw/i);
assert.match(files["lib/lms/facilitatorSessions.ts"], /requireFacilitatorSessionAccess/);
assert.match(files["lib/lms/studentLearning.ts"], /\/api\/student\/sessions\/\$\{sessionId\}\/join/);
assert.match(files["app/api/student/sessions/[sessionId]/join/route.ts"], /getStudentLiveClassTarget/);
assert.match(files["supabase/lms_late_entry_catchup.sql"], /No student, attendance, catch-up, or session data is changed/);
assert.match(files["supabase/lms_late_entry_catchup.sql"], /'LE-C'/);

console.log("Late-entry catch-up contracts passed (selection, deadline, states, provisioning, attendance cutoff, secure live access, and migration boundary). No SQL or live student mutations were performed.");
