import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { absenceReasonCategories, oralVerificationStatuses } from "@/lib/lms/absence";
import { sendAbsenceEmail, sendMakeupEmail } from "@/lib/lms/absenceEmail";
import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { LmsAdminDataError } from "@/lib/lms/adminData";
import { setLearningCompletionState } from "@/lib/lms/learningCompletionService";
import { ensureMakeupRecordingAssignment, evaluateRecordedLearningAssignment } from "@/lib/lms/recordingService";
import { triggerEngagementEvaluationForCourseEnrollment } from "@/lib/lms/engagementService";

type Actor = { actorUserId?: string | null; actorLabel: "REALMS Admin" | "Facilitator" | "Student" | "System" };
type StudentContext = { profileId: string; studentId: string; courseEnrollmentIds: string[] };

function invalid(message: string): never { throw new LmsAdminDataError(message, 400); }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function relation(value: unknown) { return Array.isArray(value) ? object(value[0]) : object(value); }
function actorReference(actor: Actor) { return actor.actorUserId ?? actor.actorLabel; }
function actorType(actor: Actor) { return actor.actorLabel.toLowerCase().replaceAll(" ", "_"); }
function requiredText(value: unknown, message: string, maximum = 4000) { if (typeof value !== "string" || !value.trim()) invalid(message); return value.trim().slice(0, maximum); }
function optionalText(value: unknown, maximum = 4000) { return typeof value === "string" ? value.trim().slice(0, maximum) || null : null; }
function validTimestamp(value: unknown, message: string) { if (typeof value !== "string" || Number.isNaN(Date.parse(value))) invalid(message); return new Date(value).toISOString(); }

export async function resolveStudentAbsenceContext(supabase: SupabaseClient, profileId: string): Promise<StudentContext> {
  const student = await supabase.from("students").select("id").eq("profile_id", profileId).maybeSingle();
  if (student.error || !student.data) throw new LmsAdminDataError("Student access required.", 403);
  const enrollments = await supabase.from("course_enrollments").select("id, student_enrollments!inner(student_id)").eq("student_enrollments.student_id", student.data.id).in("enrollment_status", ["active", "enrolled"]);
  if (enrollments.error) throw new LmsAdminDataError("Your active course enrolments could not be resolved.");
  return { profileId, studentId: student.data.id, courseEnrollmentIds: (enrollments.data ?? []).map((item) => item.id) };
}

async function resolveOwnedSession(supabase: SupabaseClient, context: StudentContext, sessionId: string) {
  const session = await supabase.from("class_sessions").select("id, cohort_course_id, title, is_required, session_status, scheduled_start_at").eq("id", sessionId).maybeSingle();
  if (session.error || !session.data) throw new LmsAdminDataError("Class session not found.", 404);
  if (!session.data.is_required || session.data.session_status === "cancelled") throw new LmsAdminDataError("Absence requests are available only for required, current class sessions.", 409);
  const enrollment = await supabase.from("course_enrollments").select("id, cohort_course_id").in("id", context.courseEnrollmentIds).eq("cohort_course_id", session.data.cohort_course_id).maybeSingle();
  if (enrollment.error || !enrollment.data) throw new LmsAdminDataError("This class session is not part of your active course enrolment.", 403);
  const attendance = await supabase.from("session_attendance").select("attendance_status").eq("course_enrollment_id", enrollment.data.id).eq("class_session_id", sessionId).maybeSingle();
  if (attendance.error) throw new LmsAdminDataError("Attendance eligibility could not be checked.");
  if (attendance.data && ["present", "late", "partial", "verified_recorded_attendance"].includes(attendance.data.attendance_status)) throw new LmsAdminDataError("An absence request cannot be created for a session you attended.", 409);
  return { session: session.data, courseEnrollmentId: enrollment.data.id };
}

async function ownedRequest(supabase: SupabaseClient, context: StudentContext, requestId: string) {
  const result = await supabase.from("absence_requests").select("*").eq("id", requestId).in("course_enrollment_id", context.courseEnrollmentIds).maybeSingle();
  if (result.error || !result.data) throw new LmsAdminDataError("Absence request not found.", 404);
  return result.data;
}

async function addAbsenceEvent(supabase: SupabaseClient, requestId: string, eventType: string, previousState: Record<string, unknown>, newState: Record<string, unknown>, actor: Actor, note?: string | null) {
  const result = await supabase.from("absence_request_events").insert({ absence_request_id: requestId, event_type: eventType, previous_state: previousState, new_state: newState, note: note ?? null, actor_type: actorType(actor), actor_identifier: actorReference(actor) });
  if (result.error) throw new LmsAdminDataError("Absence-request history could not be preserved.");
}

async function addMakeupEvent(supabase: SupabaseClient, makeupId: string, eventType: string, previousState: Record<string, unknown>, newState: Record<string, unknown>, actor: Actor, note?: string | null) {
  const result = await supabase.from("makeup_requirement_events").insert({ makeup_requirement_id: makeupId, event_type: eventType, previous_state: previousState, new_state: newState, note: note ?? null, actor_type: actorType(actor), actor_identifier: actorReference(actor) });
  if (result.error) throw new LmsAdminDataError("Make-up history could not be preserved.");
}

export async function createStudentAbsenceRequest(supabase: SupabaseClient, profileId: string, body: Record<string, unknown>) {
  const context = await resolveStudentAbsenceContext(supabase, profileId);
  const sessionId = requiredText(body.class_session_id, "Choose a class session.", 100);
  const { courseEnrollmentId } = await resolveOwnedSession(supabase, context, sessionId);
  if (!(absenceReasonCategories as readonly unknown[]).includes(body.reason_category)) invalid("Choose a valid reason category.");
  const explanation = requiredText(body.explanation, "Please provide a concise explanation.", 4000);
  if (typeof body.known_in_advance !== "boolean") invalid("Indicate whether the absence is known in advance.");
  const existing = await supabase.from("absence_requests").select("*").eq("course_enrollment_id", courseEnrollmentId).eq("class_session_id", sessionId).maybeSingle();
  if (existing.error) throw new LmsAdminDataError("An existing absence request could not be checked.");
  if (existing.data) return { request: existing.data, created: false };
  const inserted = await supabase.from("absence_requests").insert({ course_enrollment_id: courseEnrollmentId, class_session_id: sessionId, known_in_advance: body.known_in_advance, reason_category: body.reason_category, explanation, student_requested_makeup: body.student_requested_makeup !== false, request_status: "draft" }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const raced = await supabase.from("absence_requests").select("*").eq("course_enrollment_id", courseEnrollmentId).eq("class_session_id", sessionId).single();
      if (!raced.error) return { request: raced.data, created: false };
    }
    throw new LmsAdminDataError("Absence request could not be created.");
  }
  const actor = { actorLabel: "Student" as const, actorUserId: profileId };
  await addAbsenceEvent(supabase, inserted.data.id, "absence_request_created", {}, { request_status: "draft" }, actor);
  await recordLmsAudit(supabase, { action: "absence_request_created", entityType: "absence_request", entityId: inserted.data.id, actorUserId: profileId, metadata: { class_session_id: sessionId } });
  return { request: inserted.data, created: true };
}

export async function updateStudentAbsenceRequest(supabase: SupabaseClient, profileId: string, requestId: string, body: Record<string, unknown>) {
  const context = await resolveStudentAbsenceContext(supabase, profileId); const current = await ownedRequest(supabase, context, requestId);
  if (!["draft", "more_information_required"].includes(current.request_status)) throw new LmsAdminDataError("Only draft requests or requests awaiting more information can be edited.", 409);
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.known_in_advance !== undefined) { if (typeof body.known_in_advance !== "boolean") invalid("Indicate whether the absence is known in advance."); updates.known_in_advance = body.known_in_advance; }
  if (body.reason_category !== undefined) { if (!(absenceReasonCategories as readonly unknown[]).includes(body.reason_category)) invalid("Choose a valid reason category."); updates.reason_category = body.reason_category; }
  if (body.explanation !== undefined) updates.explanation = requiredText(body.explanation, "Please provide a concise explanation.", 4000);
  if (body.student_requested_makeup !== undefined) { if (typeof body.student_requested_makeup !== "boolean") invalid("Choose whether you are requesting make-up learning."); updates.student_requested_makeup = body.student_requested_makeup; }
  const saved = await supabase.from("absence_requests").update(updates).eq("id", requestId).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Absence request could not be updated.");
  return saved.data;
}

export async function submitStudentAbsenceRequest(supabase: SupabaseClient, profileId: string, requestId: string) {
  const context = await resolveStudentAbsenceContext(supabase, profileId); const current = await ownedRequest(supabase, context, requestId);
  if (current.request_status === "submitted" || current.request_status === "under_review") return { request: current, changed: false };
  if (!["draft", "more_information_required"].includes(current.request_status)) throw new LmsAdminDataError("This request cannot be submitted in its current status.", 409);
  const now = new Date().toISOString(); const saved = await supabase.from("absence_requests").update({ request_status: "submitted", submitted_at: now, updated_at: now }).eq("id", requestId).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Absence request could not be submitted.");
  const actor = { actorLabel: "Student" as const, actorUserId: profileId };
  await addAbsenceEvent(supabase, requestId, "absence_request_submitted", { request_status: current.request_status }, { request_status: "submitted" }, actor);
  await recordLmsAudit(supabase, { action: "absence_request_submitted", entityType: "absence_request", entityId: requestId, actorUserId: profileId, metadata: {} });
  const email = await sendAbsenceEmail(supabase, requestId, "received");
  return { request: saved.data, changed: true, email };
}

export async function withdrawStudentAbsenceRequest(supabase: SupabaseClient, profileId: string, requestId: string) {
  const context = await resolveStudentAbsenceContext(supabase, profileId); const current = await ownedRequest(supabase, context, requestId);
  if (current.request_status === "withdrawn") return { request: current, changed: false };
  if (!["draft", "submitted", "under_review", "more_information_required"].includes(current.request_status)) throw new LmsAdminDataError("A decided request cannot be withdrawn.", 409);
  const saved = await supabase.from("absence_requests").update({ request_status: "withdrawn", updated_at: new Date().toISOString() }).eq("id", requestId).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Absence request could not be withdrawn.");
  const actor = { actorLabel: "Student" as const, actorUserId: profileId };
  await addAbsenceEvent(supabase, requestId, "absence_request_withdrawn", { request_status: current.request_status }, { request_status: "withdrawn" }, actor);
  await recordLmsAudit(supabase, { action: "absence_request_withdrawn", entityType: "absence_request", entityId: requestId, actorUserId: profileId, metadata: {} });
  return { request: saved.data, changed: true };
}

export async function addStudentAbsenceEvidence(supabase: SupabaseClient, profileId: string, requestId: string, body: Record<string, unknown>) {
  const context = await resolveStudentAbsenceContext(supabase, profileId); const request = await ownedRequest(supabase, context, requestId);
  if (!["draft", "submitted", "under_review", "more_information_required"].includes(request.request_status)) throw new LmsAdminDataError("Evidence can no longer be added to this request.", 409);
  const title = requiredText(body.title, "Evidence title is required.", 240); const description = requiredText(body.description, "Provide a concise evidence description.", 2000);
  let externalUrl: string | null = null;
  if (body.external_url) { try { const url = new URL(String(body.external_url)); if (url.protocol !== "https:") invalid("Evidence links must use HTTPS."); externalUrl = url.toString(); } catch { invalid("Provide a valid HTTPS evidence link."); } }
  const inserted = await supabase.from("absence_request_evidence").insert({ absence_request_id: requestId, title, description, evidence_type: optionalText(body.evidence_type, 80) ?? "external_metadata", external_url: externalUrl, file_name: optionalText(body.file_name, 240), mime_type: optionalText(body.mime_type, 120), size_bytes: typeof body.size_bytes === "number" && body.size_bytes >= 0 ? Math.floor(body.size_bytes) : null }).select("id, title, description, evidence_type, external_url, file_name, mime_type, size_bytes, created_at").single();
  if (inserted.error) throw new LmsAdminDataError("Supporting-evidence metadata could not be saved.");
  return inserted.data;
}

async function cohortPolicy(supabase: SupabaseClient, sessionId: string) {
  const session = await supabase.from("class_sessions").select("cohort_courses(cohort_id)").eq("id", sessionId).maybeSingle(); const cohortId = relation(session.data?.cohort_courses).cohort_id;
  if (session.error || typeof cohortId !== "string") throw new LmsAdminDataError("Attendance policy could not be resolved.");
  const policy = await supabase.from("cohort_attendance_policies").select("*").eq("cohort_id", cohortId).eq("policy_status", "active").maybeSingle();
  if (policy.error) throw new LmsAdminDataError("Attendance policy could not be loaded.");
  return policy.data ?? { require_makeup_for_excused_absence: true, allow_unapproved_makeup: true };
}

async function ensureLearningCompletion(supabase: SupabaseClient, courseEnrollmentId: string, sessionId: string) {
  const upsert = await supabase.from("session_learning_completion").upsert({ course_enrollment_id: courseEnrollmentId, class_session_id: sessionId, completion_status: "not_started" }, { onConflict: "course_enrollment_id,class_session_id", ignoreDuplicates: true });
  if (upsert.error) throw new LmsAdminDataError("Learning-completion record could not be initialized.");
  const result = await supabase.from("session_learning_completion").select("*").eq("course_enrollment_id", courseEnrollmentId).eq("class_session_id", sessionId).single();
  if (result.error) throw new LmsAdminDataError("Learning-completion record could not be loaded.");
  return result.data;
}

async function attachMakeupMaterials(supabase: SupabaseClient, makeup: Record<string, unknown>, actor: Actor, requestedDueAt?: string | null) {
  if (makeup.makeup_status !== "awaiting_materials" && makeup.recording_learning_assignment_id) return { makeup, assigned: false, warning: null as string | null };
  try {
    const material = await ensureMakeupRecordingAssignment(supabase, { courseEnrollmentId: String(makeup.course_enrollment_id), sessionId: String(makeup.class_session_id), purpose: makeup.purpose_code as "MU-E" | "MU-U", dueAt: requestedDueAt });
    if (material.state === "awaiting_materials") return { makeup, assigned: false, warning: "The required recording is not available yet. The student deadline has not started." };
    const now = new Date().toISOString();
    const updates = { makeup_status: "assigned", available_at: material.assignment.available_at, due_at: material.assignment.due_at, class_recording_id: material.recording.id, recording_learning_assignment_id: material.assignment.id, linked_quiz_id: material.links?.quiz_id ?? null, linked_practical_assignment_id: material.links?.practical_assignment_id ?? null, linked_reflection_assignment_id: material.links?.reflection_assignment_id ?? null, requires_oral_verification: material.links?.requires_oral_verification ?? material.requirements.requiresOralVerification, updated_by: actorReference(actor), updated_at: now };
    await addMakeupEvent(supabase, String(makeup.id), "makeup_materials_available", { makeup_status: makeup.makeup_status }, { makeup_status: "assigned", due_at: material.assignment.due_at }, actor);
    const saved = await supabase.from("makeup_requirements").update(updates).eq("id", makeup.id).select("*").single();
    if (saved.error) throw new LmsAdminDataError("Available make-up materials could not be linked.");
    await recordLmsAudit(supabase, { action: "makeup_materials_available", entityType: "makeup_requirement", entityId: String(makeup.id), actorUserId: actor.actorUserId, metadata: { recording_assignment_id: material.assignment.id, due_at: material.assignment.due_at } });
    await sendMakeupEmail(supabase, String(makeup.id), "makeup_assigned");
    return { makeup: saved.data, assigned: true, warning: null };
  } catch (error) {
    if (error instanceof LmsAdminDataError && error.status === 503) return { makeup, assigned: false, warning: error.message };
    throw error;
  }
}

export async function ensureMakeupRequirement(supabase: SupabaseClient, input: { absenceRequestId?: string | null; courseEnrollmentId: string; sessionId: string; attendanceId?: string | null; purpose: "MU-E" | "MU-U"; instructions: string; dueAt?: string | null; actor: Actor }) {
  const existing = await supabase.from("makeup_requirements").select("*").eq("course_enrollment_id", input.courseEnrollmentId).eq("class_session_id", input.sessionId).eq("purpose_code", input.purpose).maybeSingle();
  if (existing.error) throw new LmsAdminDataError("An existing make-up requirement could not be checked.");
  let makeup = existing.data; let created = false;
  if (!makeup) {
    const inserted = await supabase.from("makeup_requirements").insert({ absence_request_id: input.absenceRequestId ?? null, course_enrollment_id: input.courseEnrollmentId, class_session_id: input.sessionId, session_attendance_id: input.attendanceId ?? null, purpose_code: input.purpose, makeup_status: "awaiting_materials", instructions: input.instructions, created_by: actorReference(input.actor), updated_by: actorReference(input.actor) }).select("*").single();
    if (inserted.error) {
      if (inserted.error.code !== "23505") throw new LmsAdminDataError("Make-up requirement could not be created.");
      const raced = await supabase.from("makeup_requirements").select("*").eq("course_enrollment_id", input.courseEnrollmentId).eq("class_session_id", input.sessionId).eq("purpose_code", input.purpose).single();
      if (raced.error) throw new LmsAdminDataError("Make-up requirement could not be loaded after initialization."); makeup = raced.data;
    } else { makeup = inserted.data; created = true; await addMakeupEvent(supabase, makeup.id, input.purpose === "MU-E" ? "approved_makeup_assigned" : "unapproved_makeup_assigned", {}, { makeup_status: "awaiting_materials", purpose_code: input.purpose }, input.actor); }
  } else if ((!makeup.absence_request_id && input.absenceRequestId) || (!makeup.session_attendance_id && input.attendanceId)) {
    const linked = await supabase.from("makeup_requirements").update({ absence_request_id: makeup.absence_request_id ?? input.absenceRequestId ?? null, session_attendance_id: makeup.session_attendance_id ?? input.attendanceId ?? null, updated_at: new Date().toISOString() }).eq("id", makeup.id).select("*").single();
    if (!linked.error) makeup = linked.data;
  }
  const material = await attachMakeupMaterials(supabase, makeup, input.actor, input.dueAt);
  makeup = material.makeup;
  const completion = await ensureLearningCompletion(supabase, input.courseEnrollmentId, input.sessionId);
  await setLearningCompletionState(supabase, { learningCompletionId: completion.id, status: "makeup_required", method: null, reason: `${input.purpose} learning recovery assigned without changing official attendance.`, actor: input.actor });
  const completionLink = await supabase.from("session_learning_completion").update({ makeup_requirement_id: makeup.id, required_action: makeup.makeup_status, due_at: makeup.due_at, updated_at: new Date().toISOString() }).eq("id", completion.id);
  if (completionLink.error) throw new LmsAdminDataError("Make-up learning linkage could not be saved.");
  if (created) {
    await recordLmsAudit(supabase, { action: "makeup_requirement_created", entityType: "makeup_requirement", entityId: makeup.id, actorUserId: input.actor.actorUserId, metadata: { purpose: input.purpose, class_session_id: input.sessionId } });
    await recordLmsAudit(supabase, { action: input.purpose === "MU-E" ? "approved_makeup_assigned" : "unapproved_makeup_assigned", entityType: "makeup_requirement", entityId: makeup.id, actorUserId: input.actor.actorUserId, metadata: { purpose: input.purpose, class_session_id: input.sessionId } });
  }
  return { makeup, created, materialsAssigned: material.assigned, warning: material.warning };
}

export async function initializeAwaitingMakeupsForSession(supabase: SupabaseClient, sessionId: string, actor: Actor) {
  const result = await supabase.from("makeup_requirements").select("*").eq("class_session_id", sessionId).eq("makeup_status", "awaiting_materials");
  if (result.error) throw new LmsAdminDataError("Awaiting make-up requirements could not be loaded.");
  let assigned = 0; const warnings: string[] = [];
  for (const makeup of result.data ?? []) { const material = await attachMakeupMaterials(supabase, makeup, actor); if (material.assigned) assigned += 1; if (material.warning) warnings.push(material.warning); }
  return { awaiting: result.data?.length ?? 0, assigned, warnings: [...new Set(warnings)] };
}

async function applyApprovedAttendance(supabase: SupabaseClient, request: Record<string, unknown>, actor: Actor) {
  const attendance = await supabase.from("session_attendance").select("*").eq("course_enrollment_id", request.course_enrollment_id).eq("class_session_id", request.class_session_id).maybeSingle();
  if (attendance.error) throw new LmsAdminDataError("Official attendance could not be checked.");
  if (!attendance.data) return null;
  if (["present", "late", "partial", "verified_recorded_attendance"].includes(attendance.data.attendance_status)) throw new LmsAdminDataError("This request cannot overwrite confirmed attendance evidence.", 409);
  const next = { attendance_status: "excused_absence", absence_weight: 0, absence_request_id: request.id, manual_override: true, updated_at: new Date().toISOString() };
  if (attendance.data.attendance_status !== "excused_absence" || Number(attendance.data.absence_weight) !== 0 || attendance.data.absence_request_id !== request.id) {
    const event = await supabase.from("attendance_change_events").insert({ session_attendance_id: attendance.data.id, change_type: attendance.data.finalized_at ? "approved_absence_after_finalization" : "approved_absence_applied", previous_state: { attendance_status: attendance.data.attendance_status, absence_weight: attendance.data.absence_weight, absence_request_id: attendance.data.absence_request_id }, new_state: next, reason: "Approved absence request applied without marking the student present.", changed_by: actorReference(actor) });
    if (event.error) throw new LmsAdminDataError("Attendance change history could not be preserved.");
    const saved = await supabase.from("session_attendance").update(next).eq("id", attendance.data.id);
    if (saved.error) throw new LmsAdminDataError("Approved absence could not be applied to attendance.");
    await recordLmsAudit(supabase, { action: "excused_attendance_applied", entityType: "session_attendance", entityId: attendance.data.id, actorUserId: actor.actorUserId, metadata: { absence_request_id: request.id, attendance_status: "excused_absence" } });
  }
  return attendance.data.id as string;
}

export async function reviewAbsenceRequest(supabase: SupabaseClient, requestId: string, action: "approve" | "decline" | "request_information", body: Record<string, unknown>, actor: Actor) {
  const currentResult = await supabase.from("absence_requests").select("*").eq("id", requestId).maybeSingle();
  if (currentResult.error || !currentResult.data) throw new LmsAdminDataError("Absence request not found.", 404); const current = currentResult.data;
  if (action === "request_information") {
    const note = requiredText(body.note, "Tell the student what additional information is required.", 2000);
    if (!["submitted", "under_review"].includes(current.request_status)) throw new LmsAdminDataError("Additional information can be requested only while the request is under review.", 409);
    const now = new Date().toISOString(); const saved = await supabase.from("absence_requests").update({ request_status: "more_information_required", information_requested_at: now, decision_note: note, private_admin_note: optionalText(body.private_admin_note), updated_at: now }).eq("id", requestId).select("*").single();
    if (saved.error) throw new LmsAdminDataError("Information request could not be saved.");
    await addAbsenceEvent(supabase, requestId, "absence_information_requested", { request_status: current.request_status }, { request_status: "more_information_required" }, actor, note);
    await recordLmsAudit(supabase, { action: "absence_information_requested", entityType: "absence_request", entityId: requestId, actorUserId: actor.actorUserId, metadata: {} });
    const email = await sendAbsenceEmail(supabase, requestId, "information_required"); return { request: saved.data, email };
  }
  if (["approved", "declined"].includes(current.request_status)) {
    if ((action === "approve" && current.request_status === "approved") || (action === "decline" && current.request_status === "declined")) return { request: current, changed: false };
    throw new LmsAdminDataError("A final absence decision cannot be replaced silently.", 409);
  }
  if (!["submitted", "under_review"].includes(current.request_status)) throw new LmsAdminDataError("Only a submitted request can receive a decision.", 409);
  const note = requiredText(body.note, "A clear decision note is required.", 2000); const now = new Date().toISOString(); const nextStatus = action === "approve" ? "approved" : "declined";
  const saved = await supabase.from("absence_requests").update({ request_status: nextStatus, reviewed_at: now, reviewed_by: actorReference(actor), decision_note: note, private_admin_note: optionalText(body.private_admin_note), updated_at: now }).eq("id", requestId).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Absence decision could not be saved.");
  await addAbsenceEvent(supabase, requestId, action === "approve" ? "absence_request_approved" : "absence_request_declined", { request_status: current.request_status }, { request_status: nextStatus }, actor, note);
  await recordLmsAudit(supabase, { action: action === "approve" ? "absence_request_approved" : "absence_request_declined", entityType: "absence_request", entityId: requestId, actorUserId: actor.actorUserId, metadata: {} });
  let makeup = null; let warning: string | null = null;
  const attendanceId = action === "approve" ? await applyApprovedAttendance(supabase, saved.data, actor) : (await supabase.from("session_attendance").select("id, attendance_status").eq("course_enrollment_id", current.course_enrollment_id).eq("class_session_id", current.class_session_id).maybeSingle()).data?.id ?? null;
  const policy = await cohortPolicy(supabase, current.class_session_id);
  const shouldAssignApproved = action === "approve" && (policy.require_makeup_for_excused_absence !== false || current.student_requested_makeup);
  const attendanceForDecline = action === "decline" ? await supabase.from("session_attendance").select("id, attendance_status").eq("course_enrollment_id", current.course_enrollment_id).eq("class_session_id", current.class_session_id).maybeSingle() : null;
  const shouldAssignUnapproved = action === "decline" && policy.allow_unapproved_makeup !== false && attendanceForDecline?.data?.attendance_status === "absent";
  if (shouldAssignApproved || shouldAssignUnapproved) {
    const result = await ensureMakeupRequirement(supabase, { absenceRequestId: requestId, courseEnrollmentId: current.course_enrollment_id, sessionId: current.class_session_id, attendanceId: attendanceId ?? attendanceForDecline?.data?.id ?? null, purpose: shouldAssignApproved ? "MU-E" : "MU-U", instructions: "Complete the assigned learning-recovery requirements for this missed class session.", actor });
    makeup = result.makeup; warning = result.warning;
  } else if (action === "approve") {
    const completion = await ensureLearningCompletion(supabase, current.course_enrollment_id, current.class_session_id);
    await setLearningCompletionState(supabase, { learningCompletionId: completion.id, status: "not_started", method: null, reason: "Absence approved; no make-up requirement has been assigned under the current policy.", actor });
  }
  const email = await sendAbsenceEmail(supabase, requestId, action === "approve" ? "approved" : "declined");
  await triggerEngagementEvaluationForCourseEnrollment(supabase, current.course_enrollment_id);
  return { request: saved.data, changed: true, makeup, warning, email };
}

export async function assignUnapprovedMakeup(supabase: SupabaseClient, attendanceId: string, body: Record<string, unknown>, actor: Actor) {
  const attendance = await supabase.from("session_attendance").select("*").eq("id", attendanceId).maybeSingle();
  if (attendance.error || !attendance.data) throw new LmsAdminDataError("Attendance record not found.", 404);
  if (attendance.data.attendance_status !== "absent") throw new LmsAdminDataError("Unapproved make-up can be assigned only to an absent attendance record.", 409);
  const policy = await cohortPolicy(supabase, attendance.data.class_session_id); if (policy.allow_unapproved_makeup === false) throw new LmsAdminDataError("The cohort policy does not allow unapproved make-up learning.", 409);
  const instructions = requiredText(body.instructions, "Clear make-up instructions are required.", 4000);
  const dueAt = body.due_at ? validTimestamp(body.due_at, "Provide a valid make-up deadline.") : undefined;
  if (dueAt && Date.parse(dueAt) <= Date.now()) invalid("The make-up deadline must be in the future.");
  return ensureMakeupRequirement(supabase, { courseEnrollmentId: attendance.data.course_enrollment_id, sessionId: attendance.data.class_session_id, attendanceId, purpose: "MU-U", instructions, dueAt, actor });
}

export async function updateMakeupRequirement(supabase: SupabaseClient, makeupId: string, body: Record<string, unknown>, actor: Actor) {
  const currentResult = await supabase.from("makeup_requirements").select("*").eq("id", makeupId).maybeSingle(); if (currentResult.error || !currentResult.data) throw new LmsAdminDataError("Make-up requirement not found.", 404); const current = currentResult.data;
  const action = requiredText(body.action, "Choose a make-up action.", 80);
  if (action === "refresh_materials") return attachMakeupMaterials(supabase, current, actor);
  if (action === "extend_deadline") {
    const dueAt = validTimestamp(body.due_at, "A valid extended deadline is required."); const reason = requiredText(body.reason, "A reason for extending the deadline is required.", 2000);
    if (current.due_at && Date.parse(dueAt) <= Date.parse(current.due_at)) invalid("The extended deadline must be later than the current deadline.");
    await addMakeupEvent(supabase, makeupId, "makeup_deadline_extended", { due_at: current.due_at }, { due_at: dueAt }, actor, reason);
    const saved = await supabase.from("makeup_requirements").update({ due_at: dueAt, exception_note: reason, updated_by: actorReference(actor), updated_at: new Date().toISOString() }).eq("id", makeupId).select("*").single(); if (saved.error) throw new LmsAdminDataError("Make-up deadline could not be extended.");
    if (current.recording_learning_assignment_id) await supabase.from("recording_learning_assignments").update({ due_at: dueAt, exception_note: reason, updated_at: new Date().toISOString() }).eq("id", current.recording_learning_assignment_id);
    await recordLmsAudit(supabase, { action: "makeup_deadline_extended", entityType: "makeup_requirement", entityId: makeupId, actorUserId: actor.actorUserId, metadata: { due_at: dueAt } }); return { makeup: saved.data };
  }
  if (action === "waive" || action === "cancel") {
    const reason = requiredText(body.reason, "A reason is required.", 2000); const status = action === "waive" ? "waived" : "cancelled";
    await addMakeupEvent(supabase, makeupId, `makeup_${status}`, { makeup_status: current.makeup_status }, { makeup_status: status }, actor, reason);
    const saved = await supabase.from("makeup_requirements").update({ makeup_status: status, exception_note: reason, updated_by: actorReference(actor), updated_at: new Date().toISOString() }).eq("id", makeupId).select("*").single(); if (saved.error) throw new LmsAdminDataError("Make-up requirement could not be updated."); return { makeup: saved.data };
  }
  throw new LmsAdminDataError("This make-up action is not supported.", 400);
}

export async function verifyExternalMakeupEvidence(supabase: SupabaseClient, makeupId: string, body: Record<string, unknown>, actor: Actor) {
  const reason = requiredText(body.reason, "A verification reason is required.", 2000); requiredText(body.evidence_description, "A concise evidence description is required.", 2000);
  const currentResult = await supabase.from("makeup_requirements").select("*").eq("id", makeupId).maybeSingle(); if (currentResult.error || !currentResult.data) throw new LmsAdminDataError("Make-up requirement not found.", 404); const current = currentResult.data;
  if (!["MU-E", "MU-U"].includes(current.purpose_code)) throw new LmsAdminDataError("Only a make-up requirement can use this verification workflow.", 409);
  if (["completed", "late_complete"].includes(current.makeup_status)) return { makeup: current, changed: false };
  const now = new Date().toISOString(); const status = current.purpose_code === "MU-E" ? "completed" : "late_complete"; const outcome = current.purpose_code === "MU-E" ? "approved_makeup_complete" : "unapproved_makeup_complete";
  await addMakeupEvent(supabase, makeupId, "external_makeup_evidence_verified", { makeup_status: current.makeup_status }, { makeup_status: status, completion_outcome: outcome }, actor, reason);
  const saved = await supabase.from("makeup_requirements").update({ makeup_status: status, completed_at: now, verified_at: now, verified_by: actorReference(actor), completion_outcome: outcome, exception_note: reason, updated_by: actorReference(actor), updated_at: now }).eq("id", makeupId).select("*").single(); if (saved.error) throw new LmsAdminDataError("External make-up evidence could not be verified.");
  const completion = await ensureLearningCompletion(supabase, current.course_enrollment_id, current.class_session_id); await setLearningCompletionState(supabase, { learningCompletionId: completion.id, status: current.purpose_code === "MU-E" ? "verified_complete" : "late_complete", method: current.purpose_code === "MU-E" ? "approved_makeup" : "unapproved_makeup", reason: "External make-up evidence verified by an authorised administrator.", actor });
  await supabase.from("session_learning_completion").update({ makeup_requirement_id: makeupId, required_action: null, due_at: current.due_at, updated_at: now }).eq("id", completion.id);
  if (current.recording_learning_assignment_id) await supabase.from("recording_learning_assignments").update({ assignment_status: "completed", completed_at: now, verified_at: now, verified_by: actorReference(actor), exception_note: "Completed through authorised external evidence verification.", updated_at: now }).eq("id", current.recording_learning_assignment_id);
  await recordLmsAudit(supabase, { action: "external_makeup_evidence_verified", entityType: "makeup_requirement", entityId: makeupId, actorUserId: actor.actorUserId, metadata: { purpose: current.purpose_code, attendance_unchanged: true } });
  await sendMakeupEmail(supabase, makeupId, "makeup_completed"); return { makeup: saved.data, changed: true };
}

export async function recordMakeupOralVerification(supabase: SupabaseClient, makeupId: string, body: Record<string, unknown>, actor: Actor, allowedOfferingIds: readonly string[]) {
  const status = body.status; if (!(oralVerificationStatuses as readonly unknown[]).includes(status)) invalid("Choose a valid oral-verification status."); const note = requiredText(body.note, "A brief academic verification note is required.", 1500);
  const currentResult = await supabase.from("makeup_requirements").select("*, class_sessions(cohort_course_id)").eq("id", makeupId).maybeSingle(); if (currentResult.error || !currentResult.data) throw new LmsAdminDataError("Make-up requirement not found.", 404); const current = currentResult.data; const session = relation(current.class_sessions);
  if (!allowedOfferingIds.includes(String(session.cohort_course_id))) throw new LmsAdminDataError("You are not assigned to this make-up requirement's cohort course.", 403);
  await addMakeupEvent(supabase, makeupId, status === "satisfactory" ? "oral_verification_completed" : "oral_verification_updated", { oral_verification_status: current.oral_verification_status }, { oral_verification_status: status }, actor, note);
  const saved = await supabase.from("makeup_requirements").update({ oral_verification_status: status, updated_by: actorReference(actor), updated_at: new Date().toISOString() }).eq("id", makeupId).select("*").single(); if (saved.error) throw new LmsAdminDataError("Oral verification could not be saved.");
  if (status === "satisfactory" && current.recording_learning_assignment_id) {
    const evidence = await supabase.from("recording_requirement_statuses").update({ requirement_status: "satisfied", evidence_source: "oral_verification", completed_at: new Date().toISOString(), verified_at: new Date().toISOString(), verified_by: actorReference(actor), verification_note: note, updated_at: new Date().toISOString() }).eq("recording_assignment_id", current.recording_learning_assignment_id).eq("requirement_type", "oral_verification").eq("is_required", true);
    if (evidence.error) throw new LmsAdminDataError("Oral-verification evidence could not be linked."); await evaluateRecordedLearningAssignment(supabase, current.recording_learning_assignment_id, actor);
  }
  await recordLmsAudit(supabase, { action: "oral_verification_completed", entityType: "makeup_requirement", entityId: makeupId, actorUserId: actor.actorUserId, metadata: { status } }); return saved.data;
}
