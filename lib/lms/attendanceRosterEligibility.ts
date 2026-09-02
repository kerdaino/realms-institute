export const attendanceRosterCourseStatuses = ["active", "enrolled"] as const;
export const attendanceRosterStudentEnrollmentStatuses = ["pending_onboarding", "active", "enrolled", "matriculated"] as const;
export const attendanceRosterStudentStatuses = ["pending_onboarding", "active"] as const;
export const attendanceRosterRegistrationStatuses = ["admitted"] as const;

export type AttendanceRosterEligibilityInput = {
  courseEnrollmentStatus: unknown;
  courseCohortId: unknown;
  studentEnrollmentStatus: unknown;
  studentEnrollmentCohortId: unknown;
  studentStatus: unknown;
  registrationId: unknown;
  registrationDeletedAt: unknown;
  registrationStatus: unknown;
};

export function isAttendanceRosterEligible(input: AttendanceRosterEligibilityInput) {
  return typeof input.registrationId === "string"
    && input.registrationId.length > 0
    && input.registrationDeletedAt == null
    && typeof input.courseCohortId === "string"
    && input.courseCohortId === input.studentEnrollmentCohortId
    && (attendanceRosterCourseStatuses as readonly unknown[]).includes(input.courseEnrollmentStatus)
    && (attendanceRosterStudentEnrollmentStatuses as readonly unknown[]).includes(input.studentEnrollmentStatus)
    && (attendanceRosterStudentStatuses as readonly unknown[]).includes(input.studentStatus)
    && (attendanceRosterRegistrationStatuses as readonly unknown[]).includes(input.registrationStatus);
}
