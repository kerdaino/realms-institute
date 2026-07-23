import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { triggerEngagementEvaluationForCourseEnrollment } from "@/lib/lms/engagementService";
import { LmsAdminDataError } from "@/lib/lms/adminData";
import { syncLiveLearningCompletionFromAttendance } from "@/lib/lms/learningCompletionService";
import {
  allowedDeliveryRoutes,
  attendanceAbsenceWeight,
  attendanceStatuses,
  derivePhysicalAttendanceStatus,
  engagementCheckTypes,
  firstRollResults,
  isAttendanceStatus,
  isDeliveryRoute,
  initialAttendanceStatus,
  secondRollResults,
  type AttendanceStatus,
  type FirstRollResult,
  type SecondRollResult,
} from "@/lib/lms/attendance";

type AttendanceActor = {
  actorUserId?: string | null;
  actorLabel: "REALMS Admin" | "Facilitator";
  auditClient?: SupabaseClient;
};

function invalid(message: string): never {
  throw new LmsAdminDataError(message, 400);
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function relation(value: unknown) {
  return Array.isArray(value) ? object(value[0]) : object(value);
}

function requiredReason(value: unknown) {
  if (typeof value !== "string" || !value.trim()) invalid("A clear administrative reason is required.");
  return value.trim().slice(0, 4000);
}

function optionalText(value: unknown, maximum = 4000) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") invalid("Evidence notes must be text.");
  return value.trim().slice(0, maximum) || null;
}

function nullableTimestamp(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) invalid("A valid timestamp is required.");
  return new Date(value).toISOString();
}

function nullableNumber(value: unknown, minimum: number, maximum?: number) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || (maximum !== undefined && number > maximum)) invalid("A valid evidence value is required.");
  return number;
}

function actorReference(actor: AttendanceActor) { return actor.actorUserId ?? actor.actorLabel; }

async function policyAbsenceWeight(supabase: SupabaseClient, sessionId: string, status: AttendanceStatus) {
  if (!['late', 'partial', 'absent'].includes(status)) return 0;
  const session = await supabase.from("class_sessions").select("cohort_courses(cohort_id)").eq("id", sessionId).maybeSingle();
  const cohortId = relation(session.data?.cohort_courses).cohort_id;
  if (session.error || typeof cohortId !== "string") return attendanceAbsenceWeight(status);
  const policy = await supabase.from("cohort_attendance_policies").select("late_absence_weight, partial_absence_weight, absent_absence_weight").eq("cohort_id", cohortId).eq("policy_status", "active").maybeSingle();
  if (policy.error || !policy.data) return attendanceAbsenceWeight(status);
  if (status === "late") return Number(policy.data.late_absence_weight);
  if (status === "partial") return Number(policy.data.partial_absence_weight);
  return Number(policy.data.absent_absence_weight);
}

async function attendanceById(supabase: SupabaseClient, id: string) {
  const result = await supabase.from("session_attendance").select("*").eq("id", id).maybeSingle();
  if (result.error) throw new LmsAdminDataError("Attendance record could not be loaded.");
  if (!result.data) throw new LmsAdminDataError("Attendance record not found.", 404);
  return result.data;
}

export async function ensureSessionAttendanceRoster(supabase: SupabaseClient, sessionId: string, actor: AttendanceActor) {
  const sessionResult = await supabase.from("class_sessions").select("id, cohort_course_id, is_required, title").eq("id", sessionId).maybeSingle();
  if (sessionResult.error) throw new LmsAdminDataError("Class session could not be loaded.");
  if (!sessionResult.data) throw new LmsAdminDataError("Class session not found.", 404);
  if (!sessionResult.data.is_required) return { created: 0, eligible: 0, optionalSession: true };

  const enrollmentResult = await supabase
    .from("course_enrollments")
    .select("id, delivery_route")
    .eq("cohort_course_id", sessionResult.data.cohort_course_id)
    .in("enrollment_status", ["active", "enrolled"]);
  if (enrollmentResult.error) throw new LmsAdminDataError("Eligible session roster could not be loaded.");
  const enrollments = enrollmentResult.data ?? [];
  if (!enrollments.length) return { created: 0, eligible: 0, optionalSession: false };

  const enrollmentIds = enrollments.map((enrollment) => enrollment.id);
  const [approvedRequestsResult, makeupResult] = await Promise.all([
    supabase.from("absence_requests").select("id, course_enrollment_id").eq("class_session_id", sessionId).eq("request_status", "approved").in("course_enrollment_id", enrollmentIds),
    supabase.from("makeup_requirements").select("id, course_enrollment_id, makeup_status, due_at, purpose_code").eq("class_session_id", sessionId).eq("purpose_code", "MU-E").in("course_enrollment_id", enrollmentIds),
  ]);
  if (approvedRequestsResult.error || makeupResult.error) throw new LmsAdminDataError("Approved absence state could not be applied while initializing attendance.");
  const approvedByEnrollment = new Map((approvedRequestsResult.data ?? []).map((request) => [request.course_enrollment_id, request]));
  const makeupByEnrollment = new Map((makeupResult.data ?? []).map((requirement) => [requirement.course_enrollment_id, requirement]));

  const attendanceRows = enrollments.map((enrollment) => {
    const approved = approvedByEnrollment.get(enrollment.id);
    return {
      course_enrollment_id: enrollment.id,
      class_session_id: sessionId,
      assigned_delivery_route: enrollment.delivery_route,
      attendance_route_used: enrollment.delivery_route,
      attendance_status: approved ? "excused_absence" : initialAttendanceStatus(enrollment.delivery_route),
      engagement_checks_expected: 0,
      engagement_checks_completed: 0,
      identity_verified: false,
      connection_issue_reported: false,
      online_evidence: {},
      absence_weight: 0,
      absence_request_id: approved?.id ?? null,
      manual_override: Boolean(approved),
    };
  });
  const completionRows = enrollments.map((enrollment) => {
    const makeup = makeupByEnrollment.get(enrollment.id);
    return { course_enrollment_id: enrollment.id, class_session_id: sessionId, completion_status: approvedByEnrollment.has(enrollment.id) ? "makeup_required" : "not_started", completion_method: null, makeup_requirement_id: makeup?.id ?? null, required_action: makeup?.makeup_status ?? null, due_at: makeup?.due_at ?? null };
  });
  const [attendanceResult, completionResult] = await Promise.all([
    supabase.from("session_attendance").upsert(attendanceRows, { onConflict: "course_enrollment_id,class_session_id", ignoreDuplicates: true }).select("id"),
    supabase.from("session_learning_completion").upsert(completionRows, { onConflict: "course_enrollment_id,class_session_id", ignoreDuplicates: true }).select("id"),
  ]);
  if (attendanceResult.error || completionResult.error) throw new LmsAdminDataError("Attendance records could not be prepared. Please contact a REALMS administrator.");
  const created = attendanceResult.data?.length ?? 0;
  if (makeupByEnrollment.size) {
    const roster = await supabase.from("session_attendance").select("id, course_enrollment_id").eq("class_session_id", sessionId).in("course_enrollment_id", enrollmentIds);
    if (roster.error) throw new LmsAdminDataError("Make-up attendance linkage could not be initialized.");
    for (const attendance of roster.data ?? []) {
      const makeup = makeupByEnrollment.get(attendance.course_enrollment_id);
      if (makeup) await supabase.from("makeup_requirements").update({ session_attendance_id: attendance.id, updated_at: new Date().toISOString() }).eq("id", makeup.id).is("session_attendance_id", null);
    }
  }
  await recordLmsAudit(actor.auditClient ?? supabase, {
    action: "attendance_roster_initialized",
    entityType: "class_session",
    entityId: sessionId,
    actorUserId: actor.actorUserId,
    metadata: { eligible: enrollments.length, created, actor: actor.actorLabel },
  });
  return { created, eligible: enrollments.length, optionalSession: false };
}

export async function fetchSessionAttendance(supabase: SupabaseClient, sessionId: string) {
  const [session, attendance] = await Promise.all([
    supabase.from("class_sessions").select("id, title, is_required, delivery_mode, scheduled_start_at, scheduled_end_at, session_status, cohort_courses(id, cohorts(id, code, name), courses(id, code, title, course_category))").eq("id", sessionId).maybeSingle(),
    supabase.from("session_attendance").select("*, course_enrollments(id, delivery_route, student_enrollments(id, students(id, student_number, legal_name, preferred_name)))").eq("class_session_id", sessionId).order("created_at"),
  ]);
  if (session.error || attendance.error) throw new LmsAdminDataError("Session attendance could not be loaded. Please contact a REALMS administrator.");
  if (!session.data) throw new LmsAdminDataError("Class session not found.", 404);
  const attendanceIds = (attendance.data ?? []).map((row) => row.id);
  if (!attendanceIds.length) return { session: session.data, attendance: [], engagementChecks: [], changes: [] };
  const [checks, changes] = await Promise.all([
    supabase.from("attendance_engagement_checks").select("*").in("session_attendance_id", attendanceIds),
    supabase.from("attendance_change_events").select("*").in("session_attendance_id", attendanceIds).order("created_at", { ascending: false }),
  ]);
  if (checks.error || changes.error) throw new LmsAdminDataError("Session attendance evidence could not be loaded.");
  return { session: session.data, attendance: attendance.data ?? [], engagementChecks: checks.data ?? [], changes: changes.data ?? [] };
}

export async function recordPhysicalRollCall(supabase: SupabaseClient, attendanceId: string, body: Record<string, unknown>, actor: AttendanceActor) {
  const current = await attendanceById(supabase, attendanceId);
  if (current.finalized_at) throw new LmsAdminDataError("This attendance record is finalized. Use the administrative correction workflow.", 409);
  if (current.manual_override) throw new LmsAdminDataError("This record has an authorised manual correction. Use the administrative correction workflow to change it.", 409);
  if (current.assigned_delivery_route !== "PL") invalid("Two-part physical roll call is available only for Physical Live attendance.");
  const roll = body.roll;
  const result = body.result;
  if (roll !== "first" && roll !== "second") invalid("Choose the first or second roll call.");
  if (roll === "first" && !(firstRollResults as readonly unknown[]).includes(result)) invalid("Choose a valid first roll-call result.");
  if (roll === "second" && !(secondRollResults as readonly unknown[]).includes(result)) invalid("Choose a valid second roll-call result.");
  const first = (roll === "first" ? result : current.first_roll_call) as FirstRollResult | null;
  const second = (roll === "second" ? result : current.second_roll_call) as SecondRollResult | null;
  const status = derivePhysicalAttendanceStatus(first, second);
  const absenceWeight = await policyAbsenceWeight(supabase, current.class_session_id, status);
  const now = new Date().toISOString();
  const updates = roll === "first"
    ? { first_roll_call: result, first_roll_marked_at: now, first_roll_marked_by: actorReference(actor), attendance_status: status, absence_weight: absenceWeight }
    : { second_roll_call: result, second_roll_marked_at: now, second_roll_marked_by: actorReference(actor), attendance_status: status, absence_weight: absenceWeight };
  const saved = await supabase.from("session_attendance").update(updates).eq("id", attendanceId).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Roll call could not be saved.");
  await recordLmsAudit(actor.auditClient ?? supabase, { action: "attendance_roll_call_recorded", entityType: "session_attendance", entityId: attendanceId, actorUserId: actor.actorUserId, metadata: { class_session_id: current.class_session_id, roll, result, derived_status: status, actor: actor.actorLabel } });
  return saved.data;
}

export async function updateLiveAttendanceEvidence(supabase: SupabaseClient, attendanceId: string, body: Record<string, unknown>, actor: AttendanceActor) {
  const current = await attendanceById(supabase, attendanceId);
  if (current.finalized_at) throw new LmsAdminDataError("This attendance record is finalized. Use the administrative correction workflow.", 409);
  if (current.manual_override) throw new LmsAdminDataError("This record has an authorised manual correction. Use the administrative correction workflow to change it.", 409);
  if (current.assigned_delivery_route !== "OL" && current.assigned_delivery_route !== "DL") invalid("Live attendance evidence is available only for Online Live or Discipleship Live routes.");
  const finalStatus = body.attendance_status;
  const permitted = ["present", "late", "partial", "absent", "not_verified"];
  if (!permitted.includes(String(finalStatus))) invalid("Choose a valid manually reviewed attendance status.");
  const existingEvidence = object(current.online_evidence);
  const absenceWeight = await policyAbsenceWeight(supabase, current.class_session_id, finalStatus as AttendanceStatus);
  const updates = {
    actual_joined_at: nullableTimestamp(body.online_join_at),
    actual_left_at: nullableTimestamp(body.online_leave_at),
    online_duration_minutes: nullableNumber(body.online_duration_minutes, 0),
    attendance_percentage: nullableNumber(body.online_attendance_percentage, 0, 100),
    identity_verified: typeof body.identity_verified === "boolean" ? body.identity_verified : current.identity_verified,
    engagement_checks_expected: nullableNumber(body.engagement_checks_expected, 0) ?? 0,
    engagement_checks_completed: nullableNumber(body.engagement_checks_completed, 0) ?? 0,
    connection_issue_reported: body.connection_issue_reported === true,
    online_evidence: { ...existingEvidence, additional_evidence: optionalText(body.additional_evidence), reviewed_at: new Date().toISOString(), review_source: actor.actorLabel },
    attendance_status: finalStatus as AttendanceStatus,
    absence_weight: absenceWeight,
  };
  const saved = await supabase.from("session_attendance").update(updates).eq("id", attendanceId).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Live attendance evidence could not be saved.");
  await recordLmsAudit(actor.auditClient ?? supabase, { action: "attendance_evidence_updated", entityType: "session_attendance", entityId: attendanceId, actorUserId: actor.actorUserId, metadata: { class_session_id: current.class_session_id, attendance_status: finalStatus, actor: actor.actorLabel } });
  return saved.data;
}

export async function addAttendanceEngagementCheck(supabase: SupabaseClient, attendanceId: string, body: Record<string, unknown>, actor: AttendanceActor) {
  const current = await attendanceById(supabase, attendanceId);
  if (current.finalized_at) throw new LmsAdminDataError("This attendance record is finalized. Engagement evidence can no longer be added through normal editing.", 409);
  if (current.assigned_delivery_route !== "OL" && current.assigned_delivery_route !== "DL") invalid("Engagement checks are available only for Online Live or Discipleship Live routes.");
  if (!(engagementCheckTypes as readonly unknown[]).includes(body.check_type)) invalid("Choose a valid engagement-check type.");
  if (typeof body.expected !== "boolean" || typeof body.completed !== "boolean") invalid("Expected and completed values are required.");
  const result = body.expected ? (body.completed ? "completed" : "not_completed") : (body.completed ? "optional_completed" : "optional_not_completed");
  const inserted = await supabase.from("attendance_engagement_checks").insert({ session_attendance_id: attendanceId, check_type: body.check_type, result, checked_at: new Date().toISOString(), note: optionalText(body.note, 1000), recorded_by: actorReference(actor) }).select("*").single();
  if (inserted.error) throw new LmsAdminDataError("Engagement check could not be saved.");
  const checks = await supabase.from("attendance_engagement_checks").select("result").eq("session_attendance_id", attendanceId);
  if (checks.error) throw new LmsAdminDataError("Engagement totals could not be updated.");
  const expected = (checks.data ?? []).filter((item) => item.result === "completed" || item.result === "not_completed").length;
  const completed = (checks.data ?? []).filter((item) => item.result === "completed").length;
  const totals = await supabase.from("session_attendance").update({ engagement_checks_expected: expected, engagement_checks_completed: completed }).eq("id", attendanceId);
  if (totals.error) throw new LmsAdminDataError("Engagement totals could not be updated.");
  await recordLmsAudit(actor.auditClient ?? supabase, { action: "attendance_evidence_updated", entityType: "session_attendance", entityId: attendanceId, actorUserId: actor.actorUserId, metadata: { class_session_id: current.class_session_id, engagement_check_type: body.check_type, expected: body.expected, completed: body.completed, actor: actor.actorLabel } });
  return inserted.data;
}

export async function finalizeAttendance(supabase: SupabaseClient, attendanceId: string, body: Record<string, unknown>, actor: AttendanceActor) {
  const current = await attendanceById(supabase, attendanceId);
  if (current.finalized_at) return current;
  if (["pending", "pending_recorded_verification"].includes(current.attendance_status)) throw new LmsAdminDataError("Resolve the attendance status before finalizing this record.", 409);
  if (current.assigned_delivery_route === "RP" || current.assigned_delivery_route === "DR-E") throw new LmsAdminDataError("Recorded attendance is finalized only by the recorded-learning requirement evaluator.", 409);
  const finalizedAt = new Date().toISOString();
  const saved = await supabase.from("session_attendance").update({ finalized_at: finalizedAt, finalized_by: actorReference(actor) }).eq("id", attendanceId).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Attendance could not be finalized.");
  await recordLmsAudit(actor.auditClient ?? supabase, { action: "attendance_finalized", entityType: "session_attendance", entityId: attendanceId, actorUserId: actor.actorUserId, metadata: { class_session_id: current.class_session_id, attendance_status: current.attendance_status, note: optionalText(body.note), actor: actor.actorLabel } });
  await syncLiveLearningCompletionFromAttendance(supabase, attendanceId, { actorLabel: actor.actorLabel, actorUserId: actor.actorUserId });
  await triggerEngagementEvaluationForCourseEnrollment(actor.auditClient ?? supabase, current.course_enrollment_id);
  return saved.data;
}

export async function correctFinalizedAttendance(supabase: SupabaseClient, attendanceId: string, body: Record<string, unknown>, actor: AttendanceActor) {
  const reason = requiredReason(body.reason);
  const current = await attendanceById(supabase, attendanceId);
  if (!isAttendanceStatus(body.attendance_status) || ["pending", "pending_recorded_verification"].includes(body.attendance_status)) invalid("Choose a final attendance status.");
  if (body.attendance_status === "verified_recorded_attendance") throw new LmsAdminDataError("Recorded attendance is verified only by the recorded-learning requirement evaluator.", 409);
  const nextStatus = body.attendance_status;
  const next = { attendance_status: nextStatus, absence_weight: await policyAbsenceWeight(supabase, current.class_session_id, nextStatus), manual_override: true, updated_at: new Date().toISOString() };
  const event = await supabase.from("attendance_change_events").insert({ session_attendance_id: attendanceId, change_type: current.finalized_at ? "finalized_status_correction" : "administrative_status_correction", previous_state: { attendance_status: current.attendance_status, absence_weight: current.absence_weight }, new_state: next, reason, changed_by: actorReference(actor) });
  if (event.error) throw new LmsAdminDataError("Attendance correction history could not be preserved.");
  const saved = await supabase.from("session_attendance").update(next).eq("id", attendanceId).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Attendance correction could not be saved.");
  await recordLmsAudit(actor.auditClient ?? supabase, { action: "attendance_corrected", entityType: "session_attendance", entityId: attendanceId, actorUserId: actor.actorUserId, metadata: { class_session_id: current.class_session_id, previous_status: current.attendance_status, next_status: nextStatus, reason, actor: actor.actorLabel } });
  if (saved.data.finalized_at) await syncLiveLearningCompletionFromAttendance(supabase, attendanceId, { actorLabel: actor.actorLabel, actorUserId: actor.actorUserId });
  await triggerEngagementEvaluationForCourseEnrollment(actor.auditClient ?? supabase, current.course_enrollment_id);
  return saved.data;
}

export async function changeCourseDeliveryRoute(supabase: SupabaseClient, courseEnrollmentId: string, body: Record<string, unknown>, actor: AttendanceActor) {
  const reason = requiredReason(body.reason);
  if (!isDeliveryRoute(body.delivery_route)) invalid("Choose a valid delivery route.");
  const currentResult = await supabase.from("course_enrollments").select("id, delivery_route, cohort_courses(courses(course_category))").eq("id", courseEnrollmentId).maybeSingle();
  if (currentResult.error) throw new LmsAdminDataError("Course enrolment could not be loaded.");
  if (!currentResult.data) throw new LmsAdminDataError("Course enrolment not found.", 404);
  const courseCategory = relation(relation(currentResult.data.cohort_courses).courses).course_category;
  const allowed = allowedDeliveryRoutes(typeof courseCategory === "string" ? courseCategory : null);
  if (!(allowed as readonly string[]).includes(body.delivery_route)) invalid("That delivery route is not compatible with this course.");
  if (currentResult.data.delivery_route === body.delivery_route) invalid("Choose a different delivery route.");
  const event = await supabase.from("delivery_route_change_events").insert({ course_enrollment_id: courseEnrollmentId, previous_route: currentResult.data.delivery_route, new_route: body.delivery_route, reason, changed_by: actorReference(actor) });
  if (event.error) throw new LmsAdminDataError("Delivery-route history could not be preserved.");
  const saved = await supabase.from("course_enrollments").update({ delivery_route: body.delivery_route, delivery_route_status: "active", delivery_route_note: reason, delivery_route_approved_at: new Date().toISOString(), delivery_route_approved_by: actorReference(actor) }).eq("id", courseEnrollmentId).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Delivery route could not be changed.");
  const pendingStatus = body.delivery_route === "RP" || body.delivery_route === "DR-E" ? "pending_recorded_verification" : "pending";
  const attendanceUpdate = await supabase.from("session_attendance").update({ assigned_delivery_route: body.delivery_route, attendance_status: pendingStatus, absence_weight: 0 }).eq("course_enrollment_id", courseEnrollmentId).is("finalized_at", null);
  if (attendanceUpdate.error) throw new LmsAdminDataError("Future attendance routes could not be synchronized.");
  await recordLmsAudit(actor.auditClient ?? supabase, { action: "delivery_route_changed", entityType: "course_enrollment", entityId: courseEnrollmentId, actorUserId: actor.actorUserId, metadata: { previous_route: currentResult.data.delivery_route, new_route: body.delivery_route, reason, actor: actor.actorLabel } });
  return saved.data;
}

export type AttendanceDashboardFilters = { cohort?: string; course?: string; session?: string; facilitator?: string; route?: string; status?: string; student?: string; from?: string; to?: string };

export async function fetchAttendanceDashboard(supabase: SupabaseClient, filters: AttendanceDashboardFilters = {}) {
  const result = await supabase.from("session_attendance").select("*, class_sessions(id, title, facilitator_id, scheduled_start_at, cohort_courses(id, cohorts(id, code, name), courses(id, code, title))), course_enrollments(id, delivery_route, student_enrollments(students(id, student_number, legal_name, preferred_name)))").order("created_at", { ascending: false }).limit(5000);
  if (result.error) throw new LmsAdminDataError("Attendance dashboard could not be loaded. Please contact a REALMS administrator.");
  const search = filters.student?.trim().toLowerCase();
  const from = filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from) ? Date.parse(`${filters.from}T00:00:00Z`) : null;
  const to = filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to) ? Date.parse(`${filters.to}T23:59:59Z`) : null;
  const rows = (result.data ?? []).filter((raw) => {
    const session = relation(raw.class_sessions);
    const offering = relation(session.cohort_courses);
    const cohort = relation(offering.cohorts);
    const course = relation(offering.courses);
    const enrollment = relation(raw.course_enrollments);
    const student = relation(relation(enrollment.student_enrollments).students);
    if (filters.cohort && cohort.id !== filters.cohort) return false;
    if (filters.course && course.id !== filters.course) return false;
    if (filters.session && session.id !== filters.session) return false;
    if (filters.facilitator && session.facilitator_id !== filters.facilitator) return false;
    if (filters.route && raw.assigned_delivery_route !== filters.route) return false;
    if (filters.status && raw.attendance_status !== filters.status) return false;
    if (search && ![student.legal_name, student.preferred_name, student.student_number].some((value) => typeof value === "string" && value.toLowerCase().includes(search))) return false;
    const scheduled = typeof session.scheduled_start_at === "string" ? Date.parse(session.scheduled_start_at) : null;
    if (from !== null && (scheduled === null || scheduled < from)) return false;
    if (to !== null && (scheduled === null || scheduled > to)) return false;
    return true;
  });
  const finalized = rows.filter((row) => row.finalized_at);
  const studentUnits = new Map<string, number>();
  for (const row of finalized) {
    const student = relation(relation(relation(row.course_enrollments).student_enrollments).students);
    if (typeof student.id === "string") studentUnits.set(student.id, (studentUnits.get(student.id) ?? 0) + Number(row.absence_weight ?? 0));
  }
  return {
    rows,
    summary: {
      total: rows.length,
      finalized: finalized.length,
      pending: rows.filter((row) => !row.finalized_at).length,
      present: finalized.filter((row) => row.attendance_status === "present").length,
      absenceUnits: finalized.reduce((sum, row) => sum + Number(row.absence_weight ?? 0), 0),
      late: finalized.filter((row) => row.attendance_status === "late").length,
      partial: finalized.filter((row) => row.attendance_status === "partial").length,
      absent: finalized.filter((row) => row.attendance_status === "absent").length,
      excused: finalized.filter((row) => row.attendance_status === "excused_absence").length,
      pendingVerification: rows.filter((row) => row.attendance_status === "pending" || row.attendance_status === "not_verified").length,
      recordedPending: rows.filter((row) => row.attendance_status === "pending_recorded_verification").length,
      connectionIssues: rows.filter((row) => row.connection_issue_reported).length,
      reviewRequired: [...studentUnits.values()].filter((units) => units > 3).length,
    },
  };
}

export function attendanceStatusOptions() {
  return attendanceStatuses;
}
