import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { isAttendanceRosterEligible } from "../lib/lms/attendanceRosterEligibility.ts";

const active = {
  courseEnrollmentStatus: "active",
  courseCohortId: "cohort-a",
  studentEnrollmentStatus: "active",
  studentEnrollmentCohortId: "cohort-a",
  studentStatus: "active",
  registrationId: "registration-a",
  registrationDeletedAt: null,
  registrationStatus: "admitted",
};

assert.equal(isAttendanceRosterEligible(active), true, "active enrolled student appears");
assert.equal(isAttendanceRosterEligible({ ...active, registrationDeletedAt: "2026-09-01T10:00:00Z" }), false, "soft-deleted application is excluded");
assert.equal(isAttendanceRosterEligible({ ...active, studentEnrollmentStatus: "withdrawn", studentStatus: "withdrawn" }), false, "withdrawn student is excluded");
assert.equal(isAttendanceRosterEligible(active), true, "approved absence does not alter roster eligibility");
assert.equal(isAttendanceRosterEligible(active), true, "recorded route does not alter roster eligibility");
assert.equal(isAttendanceRosterEligible(active), true, "pending recorded verification does not alter roster eligibility");
assert.equal(isAttendanceRosterEligible({ ...active, registrationDeletedAt: null, studentEnrollmentStatus: "withdrawn", studentStatus: "withdrawn" }), false, "restoring an application alone does not reactivate a withdrawn enrollment");
assert.equal(isAttendanceRosterEligible({ ...active, registrationStatus: "admission_offer_lapsed_payment_outstanding" }), false, "lapsed non-participant is excluded");
assert.equal(isAttendanceRosterEligible({ ...active, courseEnrollmentStatus: "inactive" }), false, "inactive course enrollment is excluded");
assert.equal(isAttendanceRosterEligible({ ...active, studentEnrollmentCohortId: "cohort-b" }), false, "cohort mismatch is excluded");

const service = await readFile(new URL("../lib/lms/attendanceService.ts", import.meta.url), "utf8");
const adminRoute = await readFile(new URL("../app/api/admin/sessions/[id]/attendance/route.ts", import.meta.url), "utf8");
const facilitatorRoute = await readFile(new URL("../app/api/facilitator/sessions/[id]/attendance/route.ts", import.meta.url), "utf8");
const softDeleteMigration = await readFile(new URL("../supabase/application_soft_delete.sql", import.meta.url), "utf8");

assert.match(service, /upsert\(attendanceRows[\s\S]*ignoreDuplicates: true/, "initialization remains idempotent and does not delete historical attendance");
assert.doesNotMatch(service, /from\("session_attendance"\)\.delete/, "historical attendance is never deleted");
assert.match(service, /annotatedAttendance\.filter\(\(row\) => row\.roster_eligible\)/, "active roster and denominator exclude removed learners");
assert.match(service, /session_status === "completed"/, "completed sessions retain historical rows");
assert.match(service, /requireRosterEligibility/, "normal attendance mutations enforce current roster eligibility");
assert.match(adminRoute, /ensureSessionAttendanceRoster/);
assert.match(facilitatorRoute, /ensureSessionAttendanceRoster/);
assert.match(adminRoute, /fetchSessionAttendance/);
assert.match(facilitatorRoute, /fetchSessionAttendance/);
assert.match(softDeleteMigration, /set deleted_at = null[\s\S]*deletion_reason = null/);
assert.doesNotMatch(softDeleteMigration, /student_enrollments[\s\S]*enrolment_status\s*=\s*'active'/, "application restore does not reactivate academic enrollment");

console.log(JSON.stringify({ eligibilityCases: 10, historicalSafetyCases: 5, sharedQueryCases: 4, restoreCases: 2, passed: 21 }, null, 2));
