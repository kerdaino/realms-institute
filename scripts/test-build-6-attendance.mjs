import assert from "node:assert/strict";

import {
  allowedDeliveryRoutes,
  attendanceAbsenceWeight,
  attendanceReviewRequired,
  defaultDeliveryRoute,
  derivePhysicalAttendanceStatus,
  initialAttendanceStatus,
} from "../lib/lms/attendance.ts";

const physicalCases = [
  ["present", "present", "present"],
  ["late", "present", "late"],
  ["absent", "present", "late"],
  ["present", "absent", "partial"],
  ["late", "absent", "partial"],
  ["absent", "absent", "absent"],
  ["approved_absence", "approved_absence", "excused_absence"],
  ["not_verified", "present", "not_verified"],
  ["present", "not_verified", "not_verified"],
  [null, null, "pending"],
];
for (const [first, second, expected] of physicalCases) assert.equal(derivePhysicalAttendanceStatus(first, second), expected);

assert.equal(attendanceAbsenceWeight("present"), 0);
assert.equal(attendanceAbsenceWeight("excused_absence"), 0);
assert.equal(attendanceAbsenceWeight("verified_recorded_attendance"), 0);
assert.equal(attendanceAbsenceWeight("late"), 0.5);
assert.equal(attendanceAbsenceWeight("partial"), 0.5);
assert.equal(attendanceAbsenceWeight("absent"), 1);
assert.equal(attendanceAbsenceWeight("pending"), 0);
assert.equal(attendanceAbsenceWeight("not_verified"), 0);

assert.equal(defaultDeliveryRoute("discipleship", "physical"), "DL");
assert.equal(defaultDeliveryRoute("skill", "physical"), "PL");
assert.equal(defaultDeliveryRoute("skill", "online"), "OL");
assert.deepEqual(allowedDeliveryRoutes("discipleship"), ["DL", "DR-E"]);
assert.deepEqual(allowedDeliveryRoutes("skill"), ["PL", "OL", "RP"]);
assert.equal(initialAttendanceStatus("RP"), "pending_recorded_verification");
assert.equal(initialAttendanceStatus("DR-E"), "pending_recorded_verification");
assert.equal(initialAttendanceStatus("PL"), "pending");
assert.equal(attendanceReviewRequired(3), false);
assert.equal(attendanceReviewRequired(3.5), true);

console.log(JSON.stringify({ physicalMatrixCases: physicalCases.length, absenceWeightCases: 8, routeCases: 8, reviewThresholdCases: 2, passed: 28 }, null, 2));
