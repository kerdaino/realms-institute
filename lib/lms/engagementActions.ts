import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { isOneOf, readNullableDate, readNullableTimestamp, readText } from "@/lib/lms/adminConstants";
import { LmsAdminDataError } from "@/lib/lms/adminData";
import { sendEngagementEventEmail, sendStandingNoticeEmail } from "@/lib/lms/engagementEmail";
import { academicStandings, mentorFollowupStatuses, noticeAuditAction, noticeTypes, recoveryPlanStatuses, reviewOutcomes, reviewStatuses, reviewTypes } from "@/lib/lms/engagement";
import { recordStudentEnrollmentMeaningfulActivity } from "@/lib/lms/engagementService";

type Row = Record<string, unknown>;
type Actor = { actorLabel: string; actorUserId?: string | null; actorType?: "admin" | "mentor" | "student" };
function fail(message: string, error: { code?: string } | null) { if (!error) return; console.error(message, { code: error.code }); throw new LmsAdminDataError(message); }
function now() { return new Date().toISOString(); }

export async function createStudentWarningNotice(supabase: SupabaseClient, body: Row, actor: Actor) {
  const studentEnrollmentId = readText(body.student_enrollment_id, 36); const noticeType = body.notice_type;
  const title = readText(body.title, 180); const reasonSummary = readText(body.reason_summary, 4000); const requiredAction = readText(body.required_action, 4000);
  const responseDueAt = readNullableTimestamp(body.response_due_at); const alertIds = Array.isArray(body.alert_ids) ? body.alert_ids.filter((value): value is string => typeof value === "string") : [];
  if (!studentEnrollmentId || !isOneOf(noticeTypes, noticeType) || !title || !reasonSummary || responseDueAt === undefined) throw new LmsAdminDataError("A student, notice type, title, factual reason summary, and valid response deadline are required.", 400);
  if (alertIds.length) {
    const alerts = await supabase.from("student_engagement_alerts").select("id").eq("student_enrollment_id", studentEnrollmentId).in("id", alertIds);
    fail("Linked alerts could not be verified.", alerts.error); if ((alerts.data ?? []).length !== new Set(alertIds).size) throw new LmsAdminDataError("Every linked alert must belong to this student enrolment.", 400);
  }
  const saved = await supabase.from("student_warning_notices").insert({ student_enrollment_id: studentEnrollmentId, notice_type: noticeType, title, reason_summary: reasonSummary, required_action: requiredAction, response_due_at: responseDueAt, notice_status: "draft", created_at: now(), updated_at: now() }).select("*").single();
  fail("Notice draft could not be created.", saved.error);
  if (alertIds.length) { const links = await supabase.from("student_warning_notice_alerts").insert(alertIds.map((id) => ({ warning_notice_id: saved.data.id, engagement_alert_id: id }))); fail("Notice alerts could not be linked.", links.error); }
  await supabase.from("student_warning_notice_events").insert({ warning_notice_id: saved.data.id, event_type: "draft_created", previous_state: {}, new_state: { notice_status: "draft" }, actor_type: actor.actorType ?? "admin", actor_identifier: actor.actorLabel });
  return saved.data;
}

export async function issueStudentWarningNotice(supabase: SupabaseClient, warningNoticeId: string, actor: Actor) {
  const current = await supabase.from("student_warning_notices").select("*").eq("id", warningNoticeId).maybeSingle();
  fail("Notice could not be loaded.", current.error); if (!current.data) throw new LmsAdminDataError("Notice not found.", 404);
  if (["issued", "acknowledged", "responded", "resolved"].includes(current.data.notice_status)) return { notice: current.data, email: await sendStandingNoticeEmail(supabase, warningNoticeId), repeated: true };
  if (current.data.notice_status !== "draft") throw new LmsAdminDataError("Only a draft notice can be issued.", 409);
  const issuedAt = now();
  const saved = await supabase.from("student_warning_notices").update({ notice_status: "issued", issued_at: issuedAt, issued_by: actor.actorLabel, updated_at: issuedAt }).eq("id", warningNoticeId).select("*").single();
  fail("Notice could not be issued.", saved.error);
  await supabase.from("student_warning_notice_events").insert({ warning_notice_id: warningNoticeId, event_type: "issued", previous_state: { notice_status: "draft" }, new_state: { notice_status: "issued", issued_at: issuedAt }, actor_type: actor.actorType ?? "admin", actor_identifier: actor.actorLabel, created_at: issuedAt });
  await supabase.from("student_notice_deliveries").insert({ warning_notice_id: warningNoticeId, channel: "in_app", delivery_status: "delivered", attempted_at: issuedAt, delivered_at: issuedAt }).then(({ error }) => { if (error?.code !== "23505") fail("In-app notice delivery could not be recorded.", error); });
  await recordLmsAudit(supabase, { action: noticeAuditAction(saved.data.notice_type), entityType: "student_warning_notice", entityId: warningNoticeId, actorUserId: actor.actorUserId, metadata: { notice_type: saved.data.notice_type, student_enrollment_id: saved.data.student_enrollment_id } });
  return { notice: saved.data, email: await sendStandingNoticeEmail(supabase, warningNoticeId), repeated: false };
}

export async function resolveStudentWarningNotice(supabase: SupabaseClient, warningNoticeId: string, body: Row, actor: Actor) {
  const resolutionNote = readText(body.resolution_note, 4000); if (!resolutionNote) throw new LmsAdminDataError("A resolution note is required.", 400);
  const current = await supabase.from("student_warning_notices").select("*").eq("id", warningNoticeId).maybeSingle(); fail("Notice could not be loaded.", current.error); if (!current.data) throw new LmsAdminDataError("Notice not found.", 404);
  const timestamp = now(); const saved = await supabase.from("student_warning_notices").update({ notice_status: "resolved", resolved_at: timestamp, resolved_by: actor.actorLabel, resolution_note: resolutionNote, updated_at: timestamp }).eq("id", warningNoticeId).select("*").single(); fail("Notice could not be resolved.", saved.error);
  await supabase.from("student_warning_notice_events").insert({ warning_notice_id: warningNoticeId, event_type: "resolved", previous_state: { notice_status: current.data.notice_status }, new_state: { notice_status: "resolved" }, note: resolutionNote, actor_type: actor.actorType ?? "admin", actor_identifier: actor.actorLabel });
  return saved.data;
}

async function verifyMentorProfile(supabase: SupabaseClient, profileId: string) {
  const role = await supabase.from("roles").select("id").eq("name", "mentor").maybeSingle(); fail("Mentor role could not be verified.", role.error);
  if (!role.data) throw new LmsAdminDataError("Mentor role is not configured.", 409);
  const authorisation = await supabase.from("user_roles").select("user_id").eq("user_id", profileId).eq("role_id", role.data.id).maybeSingle(); fail("Mentor authorisation could not be verified.", authorisation.error);
  if (!authorisation.data) throw new LmsAdminDataError("The selected profile is not authorised as a mentor.", 400);
}

export async function assignStudentMentor(supabase: SupabaseClient, studentEnrollmentId: string, body: Row, actor: Actor) {
  const mentorProfileId = readText(body.mentor_profile_id, 36); const reason = readText(body.reason, 1000);
  if (!mentorProfileId || !reason) throw new LmsAdminDataError("An authorised mentor and assignment reason are required.", 400);
  await verifyMentorProfile(supabase, mentorProfileId);
  const current = await supabase.from("mentor_assignments").select("*").eq("student_enrollment_id", studentEnrollmentId).eq("assignment_status", "active").maybeSingle(); fail("Current mentor assignment could not be loaded.", current.error);
  if (current.data?.mentor_profile_id === mentorProfileId) return { assignment: current.data, unchanged: true };
  const timestamp = now();
  if (current.data) {
    const ended = await supabase.from("mentor_assignments").update({ assignment_status: "ended", ended_at: timestamp, ended_by: actor.actorLabel, ending_reason: reason, updated_at: timestamp }).eq("id", current.data.id); fail("Previous mentor assignment could not be ended.", ended.error);
    await recordLmsAudit(supabase, { action: "mentor_assignment_ended", entityType: "mentor_assignment", entityId: current.data.id, actorUserId: actor.actorUserId, metadata: { student_enrollment_id: studentEnrollmentId, reason } });
  }
  const saved = await supabase.from("mentor_assignments").insert({ student_enrollment_id: studentEnrollmentId, mentor_profile_id: mentorProfileId, assignment_status: "active", assigned_at: timestamp, assigned_by: actor.actorLabel }).select("*, profiles(id, full_name, preferred_name, email)").single(); fail("Mentor assignment could not be created.", saved.error);
  await recordLmsAudit(supabase, { action: "mentor_assigned", entityType: "mentor_assignment", entityId: saved.data.id, actorUserId: actor.actorUserId, metadata: { student_enrollment_id: studentEnrollmentId, mentor_profile_id: mentorProfileId } });
  await sendEngagementEventEmail(supabase, studentEnrollmentId, "mentor_assigned");
  return { assignment: saved.data, unchanged: false };
}

export async function createRecoveryPlan(supabase: SupabaseClient, body: Row, actor: Actor) {
  const studentEnrollmentId = readText(body.student_enrollment_id, 36); const title = readText(body.plan_title, 180); const reason = readText(body.reason_summary, 4000);
  const startDate = readNullableDate(body.start_date); const targetDate = readNullableDate(body.target_completion_date); const mentorAssignmentId = readText(body.mentor_assignment_id, 36); const warningNoticeId = readText(body.warning_notice_id, 36);
  if (!studentEnrollmentId || !title || !reason || startDate === undefined || targetDate === undefined) throw new LmsAdminDataError("Student, plan title, factual reason, and valid dates are required.", 400);
  const saved = await supabase.from("student_recovery_plans").insert({ student_enrollment_id: studentEnrollmentId, mentor_assignment_id: mentorAssignmentId, warning_notice_id: warningNoticeId, plan_title: title, reason_summary: reason, plan_status: "draft", start_date: startDate, target_completion_date: targetDate, owner_profile_id: body.owner_profile_id ?? null, created_by: actor.actorLabel }).select("*").single(); fail("Recovery plan could not be created.", saved.error);
  const actions = Array.isArray(body.actions) ? body.actions.filter((value): value is Row => Boolean(value) && typeof value === "object" && !Array.isArray(value)) : [];
  if (actions.length) {
    const values = actions.map((action, index) => ({ recovery_plan_id: saved.data.id, action_type: readText(action.action_type, 100) ?? "academic_action", title: readText(action.title, 180), description: readText(action.description, 2000), linked_entity_type: readText(action.linked_entity_type, 100), linked_entity_id: readText(action.linked_entity_id, 100), due_at: readNullableTimestamp(action.due_at) ?? null, action_status: "pending", sort_order: index }));
    if (values.some((value) => !value.title)) throw new LmsAdminDataError("Every recovery action requires a concrete title.", 400);
    const actionResult = await supabase.from("recovery_plan_actions").insert(values); fail("Recovery plan actions could not be created.", actionResult.error);
  }
  await supabase.from("recovery_plan_events").insert({ recovery_plan_id: saved.data.id, event_type: "created", previous_state: {}, new_state: { plan_status: "draft" }, actor_type: actor.actorType ?? "admin", actor_identifier: actor.actorLabel });
  await recordLmsAudit(supabase, { action: "recovery_plan_created", entityType: "student_recovery_plan", entityId: saved.data.id, actorUserId: actor.actorUserId, metadata: { student_enrollment_id: studentEnrollmentId, action_count: actions.length } });
  return saved.data;
}

export async function updateRecoveryPlan(supabase: SupabaseClient, planId: string, body: Row, actor: Actor) {
  const planStatus = body.plan_status; if (!isOneOf(recoveryPlanStatuses, planStatus)) throw new LmsAdminDataError("A valid recovery-plan status is required.", 400);
  const current = await supabase.from("student_recovery_plans").select("*").eq("id", planId).maybeSingle(); fail("Recovery plan could not be loaded.", current.error); if (!current.data) throw new LmsAdminDataError("Recovery plan not found.", 404);
  const timestamp = now(); const updates: Row = { plan_status: planStatus, updated_at: timestamp };
  if (planStatus === "completed") { updates.completed_at = timestamp; updates.closure_outcome = readText(body.closure_outcome, 200) ?? "completed"; updates.closure_note = readText(body.closure_note, 4000); }
  if (["closed", "unsuccessful", "cancelled"].includes(planStatus)) { updates.closed_at = timestamp; updates.closure_outcome = readText(body.closure_outcome, 200) ?? planStatus; updates.closure_note = readText(body.closure_note, 4000); }
  if (["completed", "closed", "unsuccessful"].includes(planStatus) && !updates.closure_note) throw new LmsAdminDataError("An authorised closure note is required. Plans do not close automatically by date.", 400);
  const saved = await supabase.from("student_recovery_plans").update(updates).eq("id", planId).select("*").single(); fail("Recovery plan could not be updated.", saved.error);
  await supabase.from("recovery_plan_events").insert({ recovery_plan_id: planId, event_type: planStatus === "active" ? "activated" : `status_${planStatus}`, previous_state: { plan_status: current.data.plan_status }, new_state: { plan_status: planStatus }, note: readText(body.closure_note, 4000), actor_type: actor.actorType ?? "admin", actor_identifier: actor.actorLabel });
  const action = planStatus === "active" ? "recovery_plan_activated" : planStatus === "completed" ? "recovery_plan_completed" : planStatus === "unsuccessful" ? "recovery_plan_unsuccessful" : null;
  if (action) await recordLmsAudit(supabase, { action, entityType: "student_recovery_plan", entityId: planId, actorUserId: actor.actorUserId, metadata: { student_enrollment_id: current.data.student_enrollment_id } });
  if (planStatus === "active" && current.data.plan_status !== "active") await sendEngagementEventEmail(supabase, current.data.student_enrollment_id, "recovery_plan_activated");
  return saved.data;
}

export async function createReviewCase(supabase: SupabaseClient, body: Row, actor: Actor) {
  const studentEnrollmentId = readText(body.student_enrollment_id, 36); const reviewType = body.review_type; const title = readText(body.case_title, 180); const concern = readText(body.concern_summary, 4000); const evidence = readText(body.evidence_summary, 4000); const responseDueAt = readNullableTimestamp(body.response_due_at);
  if (!studentEnrollmentId || !isOneOf(reviewTypes, reviewType) || !title || !concern || responseDueAt === undefined) throw new LmsAdminDataError("Student, review type, title, factual concern, and valid response deadline are required.", 400);
  const timestamp = now(); const notify = body.notify_student !== false;
  const saved = await supabase.from("student_status_review_cases").insert({ student_enrollment_id: studentEnrollmentId, review_type: reviewType, case_title: title, concern_summary: concern, evidence_summary: evidence, case_status: notify ? "awaiting_student_response" : "open", opened_at: timestamp, opened_by: actor.actorLabel, student_notified_at: notify ? timestamp : null, response_due_at: responseDueAt }).select("*").single(); fail("Review case could not be opened.", saved.error);
  await supabase.from("student_enrollments").update({ standing_review_required: true, updated_at: timestamp }).eq("id", studentEnrollmentId);
  await recordLmsAudit(supabase, { action: "student_review_case_opened", entityType: "student_status_review_case", entityId: saved.data.id, actorUserId: actor.actorUserId, metadata: { student_enrollment_id: studentEnrollmentId, review_type: reviewType, student_notified: notify } });
  if (notify) await sendEngagementEventEmail(supabase, studentEnrollmentId, "review_case_opened");
  return saved.data;
}

export async function updateReviewCase(supabase: SupabaseClient, caseId: string, body: Row, actor: Actor) {
  const current = await supabase.from("student_status_review_cases").select("*").eq("id", caseId).maybeSingle(); fail("Review case could not be loaded.", current.error); if (!current.data) throw new LmsAdminDataError("Review case not found.", 404);
  const updates: Row = { updated_at: now() };
  if (body.case_status !== undefined) { if (!isOneOf(reviewStatuses, body.case_status)) throw new LmsAdminDataError("A valid review-case status is required.", 400); updates.case_status = body.case_status; }
  if (body.decision_outcome !== undefined) { if (!isOneOf(reviewOutcomes, body.decision_outcome)) throw new LmsAdminDataError("A valid review outcome is required.", 400); const rationale = readText(body.decision_rationale, 5000); if (!rationale) throw new LmsAdminDataError("A decision rationale is required.", 400); updates.decision_outcome = body.decision_outcome; updates.decision_rationale = rationale; updates.decided_at = now(); updates.decided_by = actor.actorLabel; }
  if (updates.case_status === "closed") { if (!updates.decision_outcome && !current.data.decision_outcome) throw new LmsAdminDataError("A review outcome is required before closing the case.", 409); updates.closed_at = now(); }
  const privateNote = readText(body.private_note, 5000); if (privateNote) { const note = await supabase.from("student_status_review_private_notes").insert({ review_case_id: caseId, note: privateNote, created_by: actor.actorLabel }); fail("Private review note could not be saved.", note.error); }
  const saved = await supabase.from("student_status_review_cases").update(updates).eq("id", caseId).select("*").single(); fail("Review case could not be updated.", saved.error);
  if (updates.decision_outcome) await recordLmsAudit(supabase, { action: "student_review_decided", entityType: "student_status_review_case", entityId: caseId, actorUserId: actor.actorUserId, metadata: { student_enrollment_id: current.data.student_enrollment_id, decision_outcome: updates.decision_outcome } });
  if (updates.decision_outcome && updates.decision_outcome !== current.data.decision_outcome) await sendEngagementEventEmail(supabase, current.data.student_enrollment_id, "review_decision_published");
  return saved.data;
}

export async function changeStudentAcademicStanding(supabase: SupabaseClient, studentEnrollmentId: string, body: Row, actor: Actor) {
  const newStanding = body.new_standing; const reason = readText(body.reason, 4000); const warningId = readText(body.linked_warning_notice_id, 36); const caseId = readText(body.linked_review_case_id, 36);
  if (!isOneOf(academicStandings, newStanding) || !reason) throw new LmsAdminDataError("A valid academic standing and clear reason are required.", 400);
  if (newStanding !== "good_standing" && !warningId && !caseId) throw new LmsAdminDataError("A formal notice or review case must support a non-good-standing change.", 400);
  const current = await supabase.from("student_enrollments").select("id, academic_standing").eq("id", studentEnrollmentId).maybeSingle(); fail("Student standing could not be loaded.", current.error); if (!current.data) throw new LmsAdminDataError("Student enrolment not found.", 404);
  if (warningId) { const warning = await supabase.from("student_warning_notices").select("id").eq("id", warningId).eq("student_enrollment_id", studentEnrollmentId).maybeSingle(); if (!warning.data) throw new LmsAdminDataError("The linked notice does not belong to this student enrolment.", 400); }
  if (caseId) { const review = await supabase.from("student_status_review_cases").select("id").eq("id", caseId).eq("student_enrollment_id", studentEnrollmentId).maybeSingle(); if (!review.data) throw new LmsAdminDataError("The linked review case does not belong to this student enrolment.", 400); }
  const timestamp = now(); const saved = await supabase.from("student_enrollments").update({ academic_standing: newStanding, standing_updated_at: timestamp, standing_updated_by: actor.actorLabel, updated_at: timestamp }).eq("id", studentEnrollmentId).select("*").single(); fail("Academic standing could not be changed.", saved.error);
  const history = await supabase.from("student_standing_change_events").insert({ student_enrollment_id: studentEnrollmentId, previous_standing: current.data.academic_standing, new_standing: newStanding, reason, linked_warning_notice_id: warningId, linked_review_case_id: caseId, changed_by: actor.actorLabel, created_at: timestamp }); fail("Standing change history could not be recorded.", history.error);
  await recordLmsAudit(supabase, { action: "academic_standing_changed", entityType: "student_enrollment", entityId: studentEnrollmentId, actorUserId: actor.actorUserId, metadata: { previous_standing: current.data.academic_standing, new_standing: newStanding, linked_warning_notice_id: warningId, linked_review_case_id: caseId } });
  if (current.data.academic_standing !== newStanding) await sendEngagementEventEmail(supabase, studentEnrollmentId, "standing_changed");
  return saved.data;
}

export async function confirmFinalEnrollmentOutcome(supabase: SupabaseClient, caseId: string, body: Row, actor: Actor) {
  const outcome = body.outcome; const rationale = readText(body.decision_rationale, 5000); const effectiveDate = readNullableDate(body.effective_date); const studentNotified = body.student_notified === true;
  if (!["deferred", "withdrawn"].includes(String(outcome)) || !rationale || !effectiveDate || !studentNotified) throw new LmsAdminDataError("Final outcome, rationale, effective date, and confirmed student notification are required.", 400);
  const review = await supabase.from("student_status_review_cases").select("*").eq("id", caseId).maybeSingle(); fail("Review case could not be loaded.", review.error); if (!review.data) throw new LmsAdminDataError("Review case not found.", 404);
  const expected = outcome === "deferred" ? "deferment_recommended" : "withdrawal_recommended";
  if (review.data.case_status !== "closed" || review.data.decision_outcome !== expected) throw new LmsAdminDataError(`A closed case with ${expected.replaceAll("_", " ")} is required before final confirmation.`, 409);
  const enrollment = await supabase.from("student_enrollments").select("student_id").eq("id", review.data.student_enrollment_id).single(); fail("Student enrolment could not be loaded.", enrollment.error); if (!enrollment.data) throw new LmsAdminDataError("Student enrolment not found.", 404);
  const timestamp = now(); const enrollmentUpdate = await supabase.from("student_enrollments").update({ enrolment_status: outcome, updated_at: timestamp }).eq("id", review.data.student_enrollment_id); fail("Student enrolment outcome could not be saved.", enrollmentUpdate.error);
  const studentUpdate = await supabase.from("students").update({ student_status: outcome, updated_at: timestamp }).eq("id", enrollment.data.student_id); fail("Student status outcome could not be saved.", studentUpdate.error);
  await recordLmsAudit(supabase, { action: outcome === "deferred" ? "student_deferred" : "student_withdrawn", entityType: "student_enrollment", entityId: review.data.student_enrollment_id, actorUserId: actor.actorUserId, metadata: { review_case_id: caseId, effective_date: effectiveDate, student_notified: true } });
  return { outcome, effectiveDate, recordsPreserved: true };
}

export async function recordMentorFollowup(supabase: SupabaseClient, mentorAssignmentId: string, body: Row, actor: Actor) {
  const contactStatus = body.contact_status; const contactMethod = readText(body.contact_method, 100); const summary = readText(body.contact_summary, 1500); const contactedAt = readNullableTimestamp(body.contacted_at); const nextFollowupAt = readNullableTimestamp(body.next_followup_at);
  if (!isOneOf(mentorFollowupStatuses, contactStatus) || !contactMethod || contactedAt === undefined || nextFollowupAt === undefined) throw new LmsAdminDataError("Contact method, valid status, and valid follow-up dates are required.", 400);
  const saved = await supabase.from("mentor_followups").insert({ mentor_assignment_id: mentorAssignmentId, followup_type: readText(body.followup_type, 100) ?? "engagement_check", contact_method: contactMethod, contacted_at: contactedAt ?? now(), contact_status: contactStatus, contact_summary: summary, agreed_next_action: readText(body.agreed_next_action, 1000), next_followup_at: nextFollowupAt, followup_outcome: readText(body.followup_outcome, 1000), created_by_profile_id: actor.actorUserId ?? null }).select("*").single(); fail("Mentor follow-up could not be recorded.", saved.error);
  await recordLmsAudit(supabase, { action: "mentor_followup_recorded", entityType: "mentor_followup", entityId: saved.data.id, actorUserId: actor.actorUserId, metadata: { mentor_assignment_id: mentorAssignmentId, contact_status: contactStatus } });
  return saved.data;
}

export async function createSupportReferral(supabase: SupabaseClient, studentEnrollmentId: string, mentorAssignmentId: string | null, body: Row, actor: Actor) {
  const category = readText(body.referral_category, 100); const referredTo = readText(body.referred_to, 180); const reason = readText(body.referral_reason_summary, 1200);
  if (!category || !referredTo || !reason) throw new LmsAdminDataError("Referral category, destination, and a minimal reason summary are required.", 400);
  const saved = await supabase.from("student_support_referrals").insert({ student_enrollment_id: studentEnrollmentId, mentor_assignment_id: mentorAssignmentId, referral_category: category, referred_to: referredTo, referral_reason_summary: reason, referral_status: "recommended", referred_at: now(), created_by: actor.actorLabel }).select("id, student_enrollment_id, referral_category, referred_to, referral_status, referred_at, created_at").single();
  fail("Support referral could not be created.", saved.error); if (!saved.data) throw new LmsAdminDataError("Support referral could not be created.");
  await recordLmsAudit(supabase, { action: "support_referral_created", entityType: "student_support_referral", entityId: saved.data.id, actorUserId: actor.actorUserId, metadata: { student_enrollment_id: studentEnrollmentId, referral_category: category } });
  return saved.data;
}

async function linkedActionComplete(supabase: SupabaseClient, action: Row) {
  const type = String(action.linked_entity_type ?? ""); const id = String(action.linked_entity_id ?? ""); if (!id) return false;
  if (type === "makeup") { const row = await supabase.from("makeup_requirements").select("makeup_status").eq("id", id).maybeSingle(); return ["completed", "late_complete", "waived"].includes(row.data?.makeup_status ?? ""); }
  if (type === "assignment") { const row = await supabase.from("assignment_submissions").select("submission_status").eq("assignment_id", id).in("submission_status", ["submitted", "awaiting_review", "graded"]).limit(1); return Boolean(row.data?.length); }
  if (type === "quiz") { const row = await supabase.from("quiz_attempts").select("passed").eq("quiz_id", id).eq("passed", true).limit(1); return Boolean(row.data?.length); }
  if (type === "recording") { const recording = await supabase.from("recording_learning_assignments").select("course_enrollment_id, class_session_id").eq("id", id).maybeSingle(); if (!recording.data) return false; const row = await supabase.from("session_learning_completion").select("completion_status").eq("course_enrollment_id", recording.data.course_enrollment_id).eq("class_session_id", recording.data.class_session_id).maybeSingle(); return ["verified_complete", "late_complete"].includes(row.data?.completion_status ?? ""); }
  return false;
}

export async function completeRecoveryAction(supabase: SupabaseClient, actionId: string, body: Row, actor: Actor) {
  const action = await supabase.from("recovery_plan_actions").select("*, student_recovery_plans(student_enrollment_id, plan_status)").eq("id", actionId).maybeSingle(); fail("Recovery action could not be loaded.", action.error); if (!action.data) throw new LmsAdminDataError("Recovery action not found.", 404);
  const derived = await linkedActionComplete(supabase, action.data as Row); const note = readText(body.completion_note, 2000);
  if (action.data.linked_entity_id && !derived) throw new LmsAdminDataError("The linked academic record is not yet complete.", 409);
  if (!action.data.linked_entity_id && !note) throw new LmsAdminDataError("A concise completion note is required for an unlinked action.", 400);
  const timestamp = now(); const saved = await supabase.from("recovery_plan_actions").update({ action_status: "completed", completed_at: timestamp, verified_at: timestamp, verified_by: actor.actorLabel, completion_note: note, updated_at: timestamp }).eq("id", actionId).select("*").single(); fail("Recovery action could not be completed.", saved.error);
  await recordLmsAudit(supabase, { action: "recovery_action_completed", entityType: "recovery_plan_action", entityId: actionId, actorUserId: actor.actorUserId, metadata: { derived_from_linked_record: derived } });
  return saved.data;
}

export async function acknowledgeWarning(supabase: SupabaseClient, warningId: string, studentEnrollmentId: string, actor: Actor) {
  const current = await supabase.from("student_warning_notices").select("*").eq("id", warningId).eq("student_enrollment_id", studentEnrollmentId).maybeSingle(); fail("Notice could not be loaded.", current.error); if (!current.data || current.data.notice_status === "draft") throw new LmsAdminDataError("Notice not found.", 404);
  if (current.data.acknowledged_at) return current.data;
  const timestamp = now(); const saved = await supabase.from("student_warning_notices").update({ acknowledged_at: timestamp, notice_status: current.data.student_response ? "responded" : "acknowledged", updated_at: timestamp }).eq("id", warningId).select("*").single(); fail("Notice acknowledgement could not be recorded.", saved.error);
  await supabase.from("student_warning_notice_events").insert({ warning_notice_id: warningId, event_type: "acknowledged", previous_state: { notice_status: current.data.notice_status }, new_state: { notice_status: saved.data.notice_status }, actor_type: "student", actor_identifier: actor.actorUserId });
  await recordLmsAudit(supabase, { action: "warning_acknowledged", entityType: "student_warning_notice", entityId: warningId, actorUserId: actor.actorUserId, metadata: { student_enrollment_id: studentEnrollmentId } });
  await recordStudentEnrollmentMeaningfulActivity(supabase, studentEnrollmentId, timestamp); return saved.data;
}

export async function respondToWarning(supabase: SupabaseClient, warningId: string, studentEnrollmentId: string, response: string, actor: Actor) {
  const textResponse = readText(response, 5000); if (!textResponse) throw new LmsAdminDataError("A response is required.", 400);
  const current = await supabase.from("student_warning_notices").select("id, notice_status").eq("id", warningId).eq("student_enrollment_id", studentEnrollmentId).neq("notice_status", "draft").maybeSingle(); if (!current.data) throw new LmsAdminDataError("Notice not found.", 404);
  const timestamp = now(); const saved = await supabase.from("student_warning_notices").update({ student_response: textResponse, responded_at: timestamp, notice_status: "responded", updated_at: timestamp }).eq("id", warningId).select("*").single(); fail("Notice response could not be saved.", saved.error);
  await supabase.from("student_warning_notice_events").insert({ warning_notice_id: warningId, event_type: "student_responded", previous_state: { notice_status: current.data.notice_status }, new_state: { notice_status: "responded" }, actor_type: "student", actor_identifier: actor.actorUserId });
  await recordLmsAudit(supabase, { action: "student_response_received", entityType: "student_warning_notice", entityId: warningId, actorUserId: actor.actorUserId, metadata: { student_enrollment_id: studentEnrollmentId } });
  await recordStudentEnrollmentMeaningfulActivity(supabase, studentEnrollmentId, timestamp); return saved.data;
}

export async function acknowledgeRecoveryPlan(supabase: SupabaseClient, planId: string, studentEnrollmentId: string, actor: Actor) {
  const timestamp = now(); const saved = await supabase.from("student_recovery_plans").update({ student_acknowledged_at: timestamp, updated_at: timestamp }).eq("id", planId).eq("student_enrollment_id", studentEnrollmentId).eq("plan_status", "active").select("*").maybeSingle(); fail("Recovery-plan acknowledgement could not be saved.", saved.error); if (!saved.data) throw new LmsAdminDataError("Active recovery plan not found.", 404);
  await supabase.from("recovery_plan_events").insert({ recovery_plan_id: planId, event_type: "student_acknowledged", previous_state: {}, new_state: { student_acknowledged_at: timestamp }, actor_type: "student", actor_identifier: actor.actorUserId });
  await recordStudentEnrollmentMeaningfulActivity(supabase, studentEnrollmentId, timestamp); return saved.data;
}

export async function respondToReviewCase(supabase: SupabaseClient, caseId: string, studentEnrollmentId: string, response: string, actor: Actor) {
  const textResponse = readText(response, 5000); if (!textResponse) throw new LmsAdminDataError("A response is required.", 400);
  const current = await supabase.from("student_status_review_cases").select("id, case_status, closed_at").eq("id", caseId).eq("student_enrollment_id", studentEnrollmentId).not("student_notified_at", "is", null).maybeSingle(); if (!current.data) throw new LmsAdminDataError("Review case not found.", 404); if (current.data.closed_at) throw new LmsAdminDataError("This review case is already closed.", 409);
  const timestamp = now(); const saved = await supabase.from("student_status_review_cases").update({ student_response: textResponse, student_responded_at: timestamp, case_status: "decision_pending", updated_at: timestamp }).eq("id", caseId).select("*").single(); fail("Review response could not be saved.", saved.error);
  await recordLmsAudit(supabase, { action: "student_review_response_received", entityType: "student_status_review_case", entityId: caseId, actorUserId: actor.actorUserId, metadata: { student_enrollment_id: studentEnrollmentId } });
  await recordStudentEnrollmentMeaningfulActivity(supabase, studentEnrollmentId, timestamp); return saved.data;
}
