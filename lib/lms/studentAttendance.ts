import "server-only";

import { attendanceReviewRequired, type AttendanceStatus, type DeliveryRoute } from "@/lib/lms/attendance";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StudentAttendanceHistoryItem = {
  id: string;
  sessionId: string;
  date: string | null;
  courseCode: string;
  courseTitle: string;
  sessionTitle: string;
  route: DeliveryRoute;
  status: AttendanceStatus;
  absenceUnits: number;
  finalizedAt: string | null;
  absenceRequestStatus: string | null;
  makeupStatus: string | null;
};

export type StudentAttendanceData = {
  history: StudentAttendanceHistoryItem[];
  finalizedCount: number;
  totalAbsenceUnits: number;
  maximumAbsenceUnits: number;
  remainingAbsenceUnits: number;
  reviewRequired: boolean;
  counts: Record<AttendanceStatus, number>;
  migrationReady: boolean;
};

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function relation(value: unknown) { return Array.isArray(value) ? object(value[0]) : object(value); }
function empty(migrationReady = true): StudentAttendanceData {
  return { history: [], finalizedCount: 0, totalAbsenceUnits: 0, maximumAbsenceUnits: 3, remainingAbsenceUnits: 3, reviewRequired: false, migrationReady, counts: { pending: 0, present: 0, late: 0, partial: 0, absent: 0, excused_absence: 0, not_verified: 0, pending_recorded_verification: 0, verified_recorded_attendance: 0 } };
}

function missingMigration(error: { code?: string; message?: string }) {
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code ?? "") || /session_attendance|delivery_route/i.test(error.message ?? "");
}

export async function getStudentAttendanceData(profileId: string): Promise<StudentAttendanceData> {
  const supabase = await createSupabaseServerClient();
  const student = await supabase.from("students").select("id").eq("profile_id", profileId).maybeSingle();
  if (student.error || !student.data) return empty();
  const enrollment = await supabase.from("student_enrollments").select("id, cohort_id").eq("student_id", student.data.id).order("enrolled_at", { ascending: false }).limit(1).maybeSingle();
  if (enrollment.error || !enrollment.data) return empty();
  const result = await supabase.from("session_attendance").select("id, course_enrollment_id, class_session_id, absence_request_id, assigned_delivery_route, attendance_status, absence_weight, finalized_at, class_sessions(id, title, scheduled_start_at, cohort_courses(courses(code, title))), course_enrollments!inner(student_enrollment_id)").eq("course_enrollments.student_enrollment_id", enrollment.data.id).order("created_at", { ascending: false });
  if (result.error) {
    if (missingMigration(result.error)) return empty(false);
    console.error("Student attendance lookup failed", { code: result.error.code });
    return empty();
  }
  const requestIds = (result.data ?? []).flatMap((item) => item.absence_request_id ? [item.absence_request_id] : []);
  const courseEnrollmentIds = [...new Set((result.data ?? []).map((item) => item.course_enrollment_id))];
  const [requests, makeups] = await Promise.all([
    requestIds.length ? supabase.from("absence_requests").select("id, request_status").in("id", requestIds) : Promise.resolve({ data: [], error: null }),
    courseEnrollmentIds.length ? supabase.from("makeup_requirements").select("course_enrollment_id, class_session_id, makeup_status").in("course_enrollment_id", courseEnrollmentIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const requestStatus = new Map((requests.data ?? []).map((item) => [item.id, item.request_status]));
  const makeupStatus = new Map((makeups.data ?? []).map((item) => [`${item.course_enrollment_id}:${item.class_session_id}`, item.makeup_status]));
  const data = empty();
  data.history = (result.data ?? []).flatMap((raw) => {
    const session = relation(raw.class_sessions); const course = relation(relation(session.cohort_courses).courses);
    if (!session.id || !course.code) return [];
    return [{ id: raw.id, sessionId: String(session.id), date: typeof session.scheduled_start_at === "string" ? session.scheduled_start_at : null, courseCode: String(course.code), courseTitle: String(course.title ?? "Course"), sessionTitle: String(session.title ?? "Class session"), route: raw.assigned_delivery_route as DeliveryRoute, status: raw.attendance_status as AttendanceStatus, absenceUnits: Number(raw.absence_weight ?? 0), finalizedAt: raw.finalized_at, absenceRequestStatus: raw.absence_request_id ? requestStatus.get(raw.absence_request_id) ?? null : null, makeupStatus: makeupStatus.get(`${raw.course_enrollment_id}:${raw.class_session_id}`) ?? null }];
  });
  const finalized = data.history.filter((item) => item.finalizedAt);
  for (const item of finalized) data.counts[item.status] += 1;
  for (const item of data.history.filter((item) => !item.finalizedAt && ["pending", "pending_recorded_verification", "not_verified"].includes(item.status))) data.counts[item.status] += 1;
  data.finalizedCount = finalized.length;
  data.totalAbsenceUnits = finalized.reduce((sum, item) => sum + item.absenceUnits, 0);
  const policy = await supabase.from("cohort_attendance_policies").select("max_unapproved_absence_units").eq("cohort_id", enrollment.data.cohort_id).maybeSingle();
  if (!policy.error && policy.data) data.maximumAbsenceUnits = Number(policy.data.max_unapproved_absence_units);
  data.remainingAbsenceUnits = Math.max(0, data.maximumAbsenceUnits - data.totalAbsenceUnits);
  data.reviewRequired = attendanceReviewRequired(data.totalAbsenceUnits);
  return data;
}

export async function getStudentSessionAttendance(sessionId: string, courseEnrollmentId: string) {
  const supabase = await createSupabaseServerClient();
  const [attendance, completion] = await Promise.all([
    supabase.from("session_attendance").select("assigned_delivery_route, attendance_status, absence_weight, finalized_at").eq("class_session_id", sessionId).eq("course_enrollment_id", courseEnrollmentId).maybeSingle(),
    supabase.from("session_learning_completion").select("completion_status, verified_at").eq("class_session_id", sessionId).eq("course_enrollment_id", courseEnrollmentId).maybeSingle(),
  ]);
  if (attendance.error && missingMigration(attendance.error)) return { attendance: null, completion: null, migrationReady: false };
  return { attendance: attendance.data, completion: completion.data, migrationReady: true };
}
