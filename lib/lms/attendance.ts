export const deliveryRoutes = ["PL", "OL", "RP", "DL", "DR-E"] as const;
export type DeliveryRoute = (typeof deliveryRoutes)[number];

export const attendanceStatuses = [
  "pending",
  "present",
  "late",
  "partial",
  "absent",
  "excused_absence",
  "not_verified",
  "pending_recorded_verification",
  "verified_recorded_attendance",
] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];

export const firstRollResults = ["present", "late", "absent", "approved_absence", "not_verified"] as const;
export const secondRollResults = ["present", "absent", "approved_absence", "not_verified"] as const;
export type FirstRollResult = (typeof firstRollResults)[number];
export type SecondRollResult = (typeof secondRollResults)[number];

export const engagementCheckTypes = ["poll", "verbal_response", "chat_response", "reflection", "camera_identity_check", "practical_check", "other"] as const;
export type EngagementCheckType = (typeof engagementCheckTypes)[number];

export const attendanceStatusLabels: Record<AttendanceStatus, string> = {
  pending: "Pending",
  present: "Present",
  late: "Late",
  partial: "Partial Attendance",
  absent: "Absent",
  excused_absence: "Approved Absence",
  not_verified: "Not Verified",
  pending_recorded_verification: "Recorded Verification Pending",
  verified_recorded_attendance: "Verified Recorded Attendance",
};

export const deliveryRouteLabels: Record<DeliveryRoute, string> = {
  PL: "Physical Live",
  OL: "Online Live",
  RP: "Recorded Primary",
  DL: "Discipleship Live",
  "DR-E": "Discipleship Recorded Exception",
};

export const recordedAttendanceWarning = "Recorded attendance requires verified completion evidence. Recording access alone does not count as attendance.";

export function isDeliveryRoute(value: unknown): value is DeliveryRoute {
  return typeof value === "string" && (deliveryRoutes as readonly string[]).includes(value);
}

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && (attendanceStatuses as readonly string[]).includes(value);
}

export function allowedDeliveryRoutes(courseCategory: string | null | undefined) {
  return courseCategory === "discipleship" ? (["DL", "DR-E"] as const) : (["PL", "OL", "RP"] as const);
}

export function defaultDeliveryRoute(courseCategory: string | null | undefined, skillLearningMode?: string | null): DeliveryRoute {
  if (courseCategory === "discipleship") return "DL";
  return skillLearningMode === "online" ? "OL" : "PL";
}

export function initialAttendanceStatus(route: DeliveryRoute): AttendanceStatus {
  return route === "RP" || route === "DR-E" ? "pending_recorded_verification" : "pending";
}

export function derivePhysicalAttendanceStatus(first: FirstRollResult | null, second: SecondRollResult | null): AttendanceStatus {
  if (!first || !second) return "pending";
  if (first === "not_verified" || second === "not_verified") return "not_verified";
  if (first === "approved_absence" && second === "approved_absence") return "excused_absence";
  if (first === "present" && second === "present") return "present";
  if ((first === "late" || first === "absent") && second === "present") return "late";
  if ((first === "present" || first === "late") && second === "absent") return "partial";
  if (first === "absent" && second === "absent") return "absent";
  return "not_verified";
}

export function attendanceAbsenceWeight(status: AttendanceStatus) {
  if (status === "late" || status === "partial") return 0.5;
  if (status === "absent") return 1;
  return 0;
}

export function attendanceReviewRequired(totalAbsenceUnits: number) {
  return totalAbsenceUnits > 3;
}
