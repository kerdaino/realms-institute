import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { LmsAdminDataError } from "@/lib/lms/adminData";
import { assessmentMatchesStudentProgramme } from "@/lib/lms/results";
import { graduationEligibilityBlockingReasons } from "@/lib/lms/graduation";

type Row = Record<string, unknown>;
export type GraduationActor = { actorUserId?: string | null; actorLabel: string };

const activeStudentStatuses = ["pending_onboarding", "active", "enrolled", "matriculated"];
const finalRequirementStatuses = ["met", "waived", "not_applicable"];

function object(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function relation(value: unknown): Row { return Array.isArray(value) ? object(value[0]) : object(value); }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function requiredText(value: unknown, message: string, minimum = 1, maximum = 5_000) { const result = text(value); if (!result || result.length < minimum) throw new LmsAdminDataError(message, 400); return result.slice(0, maximum); }
function actorReference(actor: GraduationActor) { return actor.actorUserId ?? actor.actorLabel; }
function fail(error: { code?: string } | null, message: string) { if (error) throw new LmsAdminDataError(message); }
function now() { return new Date().toISOString(); }
function isoDate(value: unknown, message: string) { const candidate = requiredText(value, message, 10, 10); const date = new Date(`${candidate}T00:00:00.000Z`); if (!Number.isFinite(date.valueOf())) throw new LmsAdminDataError(message, 400); return candidate; }

async function confirmationEvent(supabase: SupabaseClient, input: { confirmationId: string; type: string; previous: Row | null; next: Row; reason?: string | null; actor: GraduationActor }) {
  const event = await supabase.from("graduation_confirmation_events").insert({ graduation_confirmation_id: input.confirmationId, event_type: input.type, previous_state: input.previous ?? {}, new_state: input.next, reason: input.reason ?? null, actor_type: "admin", actor_identifier: actorReference(input.actor) });
  fail(event.error, "Graduation confirmation history could not be saved.");
}

export async function getGraduationConfirmationEligibility(supabase: SupabaseClient, studentEnrollmentId: string) {
  const enrollmentResult = await supabase.from("student_enrollments").select("*, students(id, profile_id, student_number, legal_name, preferred_name, email, student_status), cohorts(id, code, name, programme)").eq("id", studentEnrollmentId).maybeSingle();
  fail(enrollmentResult.error, "Student enrolment could not be loaded.");
  if (!enrollmentResult.data) throw new LmsAdminDataError("Student enrolment not found.", 404);
  const enrollment = object(enrollmentResult.data);
  const resultQuery = await supabase.from("student_programme_results").select("*").eq("student_enrollment_id", studentEnrollmentId).order("calculation_version", { ascending: false }).limit(1).maybeSingle();
  fail(resultQuery.error, "Programme result could not be loaded.");
  const result = resultQuery.data ? object(resultQuery.data) : null;
  const resultId = result ? String(result.id) : null;
  const [requirementsQuery, openCases, batchItems, corrections, confirmation] = await Promise.all([
    supabase.from("student_graduation_requirements").select("*, graduation_requirement_definitions(requirement_code, requirement_name, requirement_description, requirement_type, mandatory, active, sequence_number)").eq("student_enrollment_id", studentEnrollmentId).order("created_at"),
    supabase.from("student_status_review_cases").select("id, review_type, case_title, concern_summary, case_status").eq("student_enrollment_id", studentEnrollmentId).neq("case_status", "closed"),
    resultId ? supabase.from("academic_result_batch_items").select("id, item_status, academic_result_batches(id, batch_status, approved_at, published_at)").eq("student_programme_result_id", resultId) : Promise.resolve({ data: [], error: null }),
    resultId && result?.published_at ? supabase.from("programme_result_change_events").select("id, event_type, created_at").eq("student_programme_result_id", resultId).gt("created_at", String(result.published_at)) : Promise.resolve({ data: [], error: null }),
    supabase.from("graduation_confirmations").select("*").eq("student_enrollment_id", studentEnrollmentId).maybeSingle(),
  ]);
  for (const [query, message] of [[requirementsQuery, "Graduation requirements could not be loaded."], [openCases, "Open review matters could not be checked."], [batchItems, "Result approval record could not be checked."], [corrections, "Result corrections could not be checked."], [confirmation, "Graduation confirmation could not be loaded."]] as const) fail(query.error, message);
  const requirements = (requirementsQuery.data ?? []).map(object);
  const mandatory = requirements.filter((row) => { const definition = relation(row.graduation_requirement_definitions); return definition.active !== false && definition.mandatory !== false; });
  const integrityCases = (openCases.data ?? []).filter((row) => `${row.review_type ?? ""} ${row.case_title ?? ""} ${row.concern_summary ?? ""}`.toLowerCase().match(/integrity|conduct|identity|plagiarism|dishonest/));
  const hasPublishedBatch = (batchItems.data ?? []).some((item) => item.item_status === "included" && relation(item.academic_result_batches).batch_status === "published");
  const blockingReasons = result ? graduationEligibilityBlockingReasons({
    resultStatus: String(result.result_status ?? ""),
    resultOutcome: String(result.result_outcome ?? ""),
    allGraduationGatesMet: result.all_graduation_gates_met === true,
    mandatoryRequirementStatuses: mandatory.map((row) => String(row.requirement_status ?? "pending")),
    hasOpenIntegrityOrConductMatter: integrityCases.length > 0,
    publishedResultMatchesApprovedBatch: hasPublishedBatch,
    hasUnresolvedResultCorrection: (corrections.data ?? []).length > 0,
  }) : ["No programme result is available."];
  const student = relation(enrollment.students);
  if (!student.profile_id) blockingReasons.push("The student profile linkage is incomplete.");
  if (!student.legal_name || !student.student_number) blockingReasons.push("The controlled student identity record is incomplete.");
  return { eligible: blockingReasons.length === 0, blockingReasons: [...new Set(blockingReasons)], result, requirements, student, enrollment, cohort: relation(enrollment.cohorts), confirmation: confirmation.data ? object(confirmation.data) : null, openIntegrityOrConductCases: integrityCases };
}

async function ensureConfirmation(supabase: SupabaseClient, studentEnrollmentId: string, resultId: string) {
  const existing = await supabase.from("graduation_confirmations").select("*").eq("student_enrollment_id", studentEnrollmentId).maybeSingle();
  fail(existing.error, "Graduation confirmation could not be checked.");
  if (existing.data) return object(existing.data);
  const saved = await supabase.from("graduation_confirmations").insert({ student_enrollment_id: studentEnrollmentId, student_programme_result_id: resultId, confirmation_status: "draft" }).select("*").single();
  fail(saved.error, "Graduation confirmation could not be prepared.");
  return object(saved.data);
}

export async function checkGraduationEligibility(supabase: SupabaseClient, studentEnrollmentId: string, actor: GraduationActor) {
  const eligibility = await getGraduationConfirmationEligibility(supabase, studentEnrollmentId);
  if (!eligibility.result) throw new LmsAdminDataError("A published eligible programme result is required.", 409);
  const current = await ensureConfirmation(supabase, studentEnrollmentId, String(eligibility.result.id));
  if (["approved", "completed", "cancelled"].includes(String(current.confirmation_status))) return { confirmation: current, eligibility };
  const nextStatus = eligibility.eligible ? "eligible" : "reconciliation_required";
  const saved = await supabase.from("graduation_confirmations").update({ student_programme_result_id: eligibility.result.id, confirmation_status: nextStatus, eligibility_confirmed_at: eligibility.eligible ? now() : null, eligibility_confirmed_by: eligibility.eligible ? actorReference(actor) : null, updated_at: now() }).eq("id", String(current.id)).select("*").single();
  fail(saved.error, "Graduation eligibility could not be recorded.");
  await confirmationEvent(supabase, { confirmationId: String(current.id), type: "eligibility_checked", previous: current, next: object(saved.data), reason: eligibility.blockingReasons.join(" ") || "All central graduation conditions were satisfied.", actor });
  await recordLmsAudit(supabase, { action: "graduation_eligibility_checked", entityType: "graduation_confirmation", entityId: String(current.id), actorUserId: actor.actorUserId, metadata: { eligible: eligibility.eligible, blocking_reason_count: eligibility.blockingReasons.length } });
  return { confirmation: saved.data, eligibility };
}

export async function markGraduationIdentityReconciled(supabase: SupabaseClient, confirmationId: string, body: Row, actor: GraduationActor) {
  const confirmation = await supabase.from("graduation_confirmations").select("*").eq("id", confirmationId).maybeSingle();
  fail(confirmation.error, "Graduation confirmation could not be loaded.");
  if (!confirmation.data) throw new LmsAdminDataError("Graduation confirmation not found.", 404);
  const eligibility = await getGraduationConfirmationEligibility(supabase, confirmation.data.student_enrollment_id);
  if (!eligibility.result || String(eligibility.result.id) !== String(confirmation.data.student_programme_result_id)) throw new LmsAdminDataError("The result and enrolment identity do not reconcile.", 409);
  const expected = {
    legal_name: requiredText(body.legal_name, "Confirm the controlled legal name.", 2, 240),
    student_number: requiredText(body.student_number, "Confirm the student number.", 2, 100),
    cohort_id: requiredText(body.cohort_id, "Confirm the cohort.", 1, 80),
    discipleship_route: requiredText(body.discipleship_route, "Confirm the discipleship route.", 1, 80),
    skill_pathway: requiredText(body.skill_pathway, "Confirm the skill pathway.", 1, 100),
  };
  if (expected.legal_name !== eligibility.student.legal_name || expected.student_number !== eligibility.student.student_number || expected.cohort_id !== eligibility.enrollment.cohort_id || expected.discipleship_route !== eligibility.enrollment.discipleship_route || expected.skill_pathway !== eligibility.enrollment.skill_pathway || !eligibility.student.profile_id) throw new LmsAdminDataError("Identity reconciliation does not match the controlled student and enrolment records. Correct those records first.", 409);
  const saved = await supabase.from("graduation_confirmations").update({ identity_reconciled: true, identity_reconciled_at: now(), identity_reconciled_by: actorReference(actor), confirmation_status: eligibility.eligible ? "eligible" : "reconciliation_required", updated_at: now() }).eq("id", confirmationId).select("*").single();
  fail(saved.error, "Identity reconciliation could not be recorded.");
  await confirmationEvent(supabase, { confirmationId, type: "identity_reconciled", previous: object(confirmation.data), next: object(saved.data), reason: requiredText(body.reason, "Record the reconciliation basis.", 10, 2000), actor });
  await recordLmsAudit(supabase, { action: "graduation_identity_reconciled", entityType: "graduation_confirmation", entityId: confirmationId, actorUserId: actor.actorUserId, metadata: { student_enrollment_id: confirmation.data.student_enrollment_id } });
  return saved.data;
}

export async function markGraduationAcademicRecordReconciled(supabase: SupabaseClient, confirmationId: string, body: Row, actor: GraduationActor) {
  const confirmation = await supabase.from("graduation_confirmations").select("*").eq("id", confirmationId).maybeSingle();
  fail(confirmation.error, "Graduation confirmation could not be loaded.");
  if (!confirmation.data) throw new LmsAdminDataError("Graduation confirmation not found.", 404);
  const eligibility = await getGraduationConfirmationEligibility(supabase, confirmation.data.student_enrollment_id);
  if (!eligibility.eligible) throw new LmsAdminDataError(`Academic reconciliation is blocked: ${eligibility.blockingReasons.join(" ")}`, 409);
  if (eligibility.requirements.some((row) => relation(row.graduation_requirement_definitions).mandatory !== false && !finalRequirementStatuses.includes(String(row.requirement_status)))) throw new LmsAdminDataError("Every mandatory academic requirement must be final.", 409);
  const saved = await supabase.from("graduation_confirmations").update({ academic_record_reconciled: true, academic_record_reconciled_at: now(), academic_record_reconciled_by: actorReference(actor), confirmation_status: "eligible", updated_at: now() }).eq("id", confirmationId).select("*").single();
  fail(saved.error, "Academic reconciliation could not be recorded.");
  await confirmationEvent(supabase, { confirmationId, type: "academic_record_reconciled", previous: object(confirmation.data), next: object(saved.data), reason: requiredText(body.reason, "Record the academic reconciliation basis.", 10, 2000), actor });
  await recordLmsAudit(supabase, { action: "graduation_academic_record_reconciled", entityType: "graduation_confirmation", entityId: confirmationId, actorUserId: actor.actorUserId, metadata: { student_enrollment_id: confirmation.data.student_enrollment_id } });
  return saved.data;
}

export async function transitionGraduationConfirmation(supabase: SupabaseClient, confirmationId: string, body: Row, actor: GraduationActor) {
  const action = requiredText(body.action, "Choose a graduation action.", 2, 40);
  const currentResult = await supabase.from("graduation_confirmations").select("*").eq("id", confirmationId).maybeSingle();
  fail(currentResult.error, "Graduation confirmation could not be loaded.");
  if (!currentResult.data) throw new LmsAdminDataError("Graduation confirmation not found.", 404);
  const current = object(currentResult.data);
  const eligibility = await getGraduationConfirmationEligibility(supabase, String(current.student_enrollment_id));
  const timestamp = now();
  let values: Row;
  let eventType: string;
  let auditAction: "graduation_submitted_for_approval" | "graduation_approved" | "graduation_completed";
  if (action === "submit") {
    if (!eligibility.eligible || !current.identity_reconciled || !current.academic_record_reconciled || !["eligible", "reconciliation_required"].includes(String(current.confirmation_status))) throw new LmsAdminDataError("Eligibility, identity reconciliation and academic reconciliation are all required before submission.", 409);
    values = { confirmation_status: "awaiting_approval", submitted_for_approval_at: timestamp, submitted_for_approval_by: actorReference(actor), updated_at: timestamp };
    eventType = "submitted_for_approval"; auditAction = "graduation_submitted_for_approval";
  } else if (action === "approve") {
    if (current.confirmation_status !== "awaiting_approval" || !eligibility.eligible || !current.identity_reconciled || !current.academic_record_reconciled) throw new LmsAdminDataError("This confirmation is not ready for graduation approval.", 409);
    if (current.submitted_for_approval_by === actorReference(actor)) throw new LmsAdminDataError("The submitter and graduation approver must be different authorised people.", 409);
    values = { confirmation_status: "approved", graduation_approved_at: timestamp, graduation_approved_by: actorReference(actor), completion_date: isoDate(body.completion_date, "Record the confirmed completion date."), graduation_date: text(body.graduation_date) ? isoDate(body.graduation_date, "Enter a valid graduation date.") : null, decision_reference: requiredText(body.decision_reference, "Record the authorised graduation decision reference.", 3, 500), decision_note: requiredText(body.decision_note, "Record the authorised decision note.", 10, 3000), updated_at: timestamp };
    eventType = "approved"; auditAction = "graduation_approved";
  } else if (action === "complete") {
    if (current.confirmation_status !== "approved") throw new LmsAdminDataError("Graduation must be approved before processing can be completed.", 409);
    values = { confirmation_status: "completed", completed_processing_at: timestamp, completed_processing_by: actorReference(actor), updated_at: timestamp };
    eventType = "completed"; auditAction = "graduation_completed";
  } else throw new LmsAdminDataError("Choose a supported graduation transition.", 400);
  const saved = await supabase.from("graduation_confirmations").update(values).eq("id", confirmationId).select("*").single();
  fail(saved.error, "Graduation confirmation could not be updated.");
  await confirmationEvent(supabase, { confirmationId, type: eventType, previous: current, next: object(saved.data), reason: text(body.reason) ?? text(values.decision_note), actor });
  await recordLmsAudit(supabase, { action: auditAction, entityType: "graduation_confirmation", entityId: confirmationId, actorUserId: actor.actorUserId, metadata: { previous_status: current.confirmation_status, next_status: values.confirmation_status } });
  return saved.data;
}

export async function cancelGraduationConfirmation(supabase: SupabaseClient, confirmationId: string, body: Row, actor: GraduationActor) {
  const current = await supabase.from("graduation_confirmations").select("*").eq("id", confirmationId).maybeSingle();
  fail(current.error, "Graduation confirmation could not be loaded.");
  if (!current.data) throw new LmsAdminDataError("Graduation confirmation not found.", 404);
  if (current.data.confirmation_status === "completed") throw new LmsAdminDataError("A completed graduation record cannot be cancelled through this action.", 409);
  const reason = requiredText(body.reason, "A documented cancellation reason is required.", 15, 3000);
  const saved = await supabase.from("graduation_confirmations").update({ confirmation_status: "cancelled", cancelled_at: now(), cancelled_by: actorReference(actor), cancellation_reason: reason, updated_at: now() }).eq("id", confirmationId).select("*").single();
  fail(saved.error, "Graduation confirmation could not be cancelled.");
  await confirmationEvent(supabase, { confirmationId, type: "cancelled", previous: object(current.data), next: object(saved.data), reason, actor });
  return saved.data;
}

function alumniNumber() { return `REALMS-ALUM-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`; }

export async function convertConfirmedGraduateToAlumni(supabase: SupabaseClient, graduationConfirmationId: string, actor: GraduationActor) {
  const confirmationQuery = await supabase.from("graduation_confirmations").select("*, student_enrollments(*, students(*), cohorts(*)), student_programme_results(*)").eq("id", graduationConfirmationId).maybeSingle();
  fail(confirmationQuery.error, "Graduation confirmation could not be loaded for conversion.");
  if (!confirmationQuery.data) throw new LmsAdminDataError("Graduation confirmation not found.", 404);
  const confirmation = object(confirmationQuery.data);
  if (!["approved", "completed"].includes(String(confirmation.confirmation_status))) throw new LmsAdminDataError("Only an approved or completed graduation confirmation can be converted.", 409);
  const enrollment = relation(confirmation.student_enrollments); const student = relation(enrollment.students); const cohort = relation(enrollment.cohorts); const result = relation(confirmation.student_programme_results);
  if (!student.id || !student.profile_id || result.result_status !== "published" || result.result_outcome !== "eligible_for_completion" || result.all_graduation_gates_met !== true) throw new LmsAdminDataError("The confirmed graduate no longer satisfies the conversion checks.", 409);
  const date = String(confirmation.graduation_date ?? confirmation.completion_date);
  if (!date || date === "null") throw new LmsAdminDataError("A completion or graduation date is required before alumni conversion.", 409);
  let alumniQuery = await supabase.from("alumni").select("*").eq("student_id", String(student.id)).maybeSingle();
  fail(alumniQuery.error, "The alumni person record could not be checked.");
  if (!alumniQuery.data) {
    alumniQuery = await supabase.from("alumni").insert({ student_id: student.id, alumni_number: alumniNumber(), alumni_since: date, first_graduated_at: date, alumni_status: "active", learning_archive_access: true }).select("*").single();
  } else {
    const updates: Row = { alumni_status: "active", updated_at: now() };
    if (!alumniQuery.data.alumni_number) updates.alumni_number = alumniNumber();
    if (!alumniQuery.data.alumni_since) updates.alumni_since = date;
    if (!alumniQuery.data.first_graduated_at) updates.first_graduated_at = date;
    if (alumniQuery.data.learning_archive_access === null) updates.learning_archive_access = true;
    alumniQuery = await supabase.from("alumni").update(updates).eq("id", alumniQuery.data.id).select("*").single();
  }
  fail(alumniQuery.error, "The alumni person record could not be saved.");
  const alumni = object(alumniQuery.data);
  let programmeQuery = await supabase.from("alumni_programme_records").select("*").eq("student_enrollment_id", String(enrollment.id)).maybeSingle();
  fail(programmeQuery.error, "The alumni programme record could not be checked.");
  if (!programmeQuery.data) {
    programmeQuery = await supabase.from("alumni_programme_records").insert({ alumni_id: alumni.id, student_enrollment_id: enrollment.id, graduation_confirmation_id: confirmation.id, student_programme_result_id: result.id, cohort_id: cohort.id, programme_name: cohort.programme ?? "REALMS School of Discovery", cohort_name_snapshot: cohort.name ?? cohort.code, discipleship_route: enrollment.discipleship_route, skill_pathway: enrollment.skill_pathway, skill_learning_mode: enrollment.skill_learning_mode, completion_date: confirmation.completion_date, graduation_date: confirmation.graduation_date, programme_record_status: "completed", result_total_points: result.total_points, result_outcome: result.result_outcome }).select("*").single();
    fail(programmeQuery.error, "The alumni programme record could not be created.");
    await recordLmsAudit(supabase, { action: "alumni_programme_record_created", entityType: "alumni_programme_record", entityId: String(programmeQuery.data.id), actorUserId: actor.actorUserId, metadata: { student_enrollment_id: enrollment.id } });
  }
  const programme = object(programmeQuery.data);
  const role = await supabase.from("roles").select("id").eq("name", "alumni").maybeSingle();
  fail(role.error, "The alumni access role could not be resolved.");
  if (!role.data) throw new LmsAdminDataError("The alumni access role is not configured.", 503);
  const roleSaved = await supabase.from("user_roles").upsert({ user_id: student.profile_id, role_id: role.data.id }, { onConflict: "user_id,role_id", ignoreDuplicates: true });
  fail(roleSaved.error, "Alumni portal access could not be activated.");
  const enrollmentSaved = await supabase.from("student_enrollments").update({ enrolment_status: "completed", completed_at: confirmation.completion_date ? `${confirmation.completion_date}T00:00:00.000Z` : now(), updated_at: now() }).eq("id", String(enrollment.id));
  fail(enrollmentSaved.error, "The completed student enrolment could not be recorded.");
  const otherActive = await supabase.from("student_enrollments").select("id", { count: "exact", head: true }).eq("student_id", String(student.id)).neq("id", String(enrollment.id)).in("enrolment_status", activeStudentStatuses);
  fail(otherActive.error, "Other active programmes could not be checked.");
  if ((otherActive.count ?? 0) === 0) {
    const studentSaved = await supabase.from("students").update({ student_status: "completed", updated_at: now() }).eq("id", String(student.id));
    fail(studentSaved.error, "The completed student status could not be recorded.");
  }
  const existingEvent = await supabase.from("alumni_conversion_events").select("id").eq("student_enrollment_id", String(enrollment.id)).eq("event_type", "converted").maybeSingle();
  if (!existingEvent.data) {
    const event = await supabase.from("alumni_conversion_events").insert({ alumni_id: alumni.id, alumni_programme_record_id: programme.id, student_enrollment_id: enrollment.id, event_type: "converted", previous_state: { student_status: student.student_status, enrolment_status: enrollment.enrolment_status }, new_state: { alumni_status: alumni.alumni_status, enrolment_status: "completed" }, reason: "Approved graduation converted through the controlled Build 12 workflow.", converted_by: actorReference(actor) });
    fail(event.error, "Alumni conversion history could not be saved.");
  }
  await initializeAlumniLearningArchive(supabase, String(programme.id), actor);
  await recordLmsAudit(supabase, { action: "graduate_converted_to_alumni", entityType: "alumni", entityId: String(alumni.id), actorUserId: actor.actorUserId, metadata: { alumni_programme_record_id: programme.id, student_enrollment_id: enrollment.id } });
  return { alumni, programme };
}

export async function initializeAlumniLearningArchive(supabase: SupabaseClient, alumniProgrammeRecordId: string, actor: GraduationActor) {
  const recordQuery = await supabase.from("alumni_programme_records").select("*").eq("id", alumniProgrammeRecordId).maybeSingle();
  fail(recordQuery.error, "Alumni programme record could not be loaded.");
  if (!recordQuery.data || recordQuery.data.programme_record_status !== "completed") throw new LmsAdminDataError("A completed alumni programme record is required.", 409);
  const record = object(recordQuery.data);
  const enrollments = await supabase.from("course_enrollments").select("*, cohort_courses(*, courses(*))").eq("student_enrollment_id", String(record.student_enrollment_id)).not("enrollment_status", "in", "(cancelled,test)");
  fail(enrollments.error, "Completed programme courses could not be loaded.");
  const archives: Row[] = [];
  for (const row of enrollments.data ?? []) {
    const offering = relation(row.cohort_courses); const course = relation(offering.courses);
    if (String(offering.cohort_id) !== String(record.cohort_id)) continue;
    if (!assessmentMatchesStudentProgramme({ courseCategory: String(course.course_category ?? ""), courseDiscipleshipRoute: text(course.discipleship_route), courseSkillPathway: text(course.skill_pathway), studentDiscipleshipRoute: String(record.discipleship_route), studentSkillPathway: String(record.skill_pathway) })) continue;
    let archive = await supabase.from("alumni_course_archives").select("*").eq("alumni_programme_record_id", alumniProgrammeRecordId).eq("course_enrollment_id", row.id).maybeSingle();
    fail(archive.error, "Course archive could not be checked.");
    if (!archive.data) archive = await supabase.from("alumni_course_archives").insert({ alumni_programme_record_id: alumniProgrammeRecordId, course_enrollment_id: row.id, cohort_course_id: offering.id, course_id: course.id, course_code_snapshot: course.code, course_title_snapshot: course.title, category_snapshot: course.course_category, discipleship_route_snapshot: course.discipleship_route, skill_pathway_snapshot: course.skill_pathway, completion_status_snapshot: row.enrollment_status, archive_status: "active" }).select("*").single();
    fail(archive.error, "Course archive could not be created.");
    archives.push(object(archive.data));
    await archivePublishedSummaries(supabase, object(archive.data), actor);
  }
  await recordLmsAudit(supabase, { action: "alumni_archive_initialized", entityType: "alumni_programme_record", entityId: alumniProgrammeRecordId, actorUserId: actor.actorUserId, metadata: { archived_course_count: archives.length } });
  return archives;
}

async function archivePublishedSummaries(supabase: SupabaseClient, courseArchive: Row, actor: GraduationActor) {
  const sessions = await supabase.from("class_sessions").select("id, title, scheduled_start_at, class_summaries(*)").eq("cohort_course_id", String(courseArchive.cohort_course_id)).order("scheduled_start_at");
  fail(sessions.error, "Published class summaries could not be loaded.");
  for (const session of sessions.data ?? []) {
    const summaries = (session.class_summaries ?? []).filter((summary: Row) => summary.summary_status === "published" && summary.published_at).sort((a: Row, b: Row) => Number(a.version_number) - Number(b.version_number));
    for (const summary of summaries) await archivePublishedSummary(supabase, courseArchive, object(session), object(summary), actor);
  }
}

export async function archivePublishedSummary(supabase: SupabaseClient, courseArchive: Row, session: Row, summary: Row, actor: GraduationActor) {
  if (summary.summary_status !== "published" || !summary.published_at) return null;
  const existing = await supabase.from("alumni_summary_archive_items").select("*").eq("alumni_course_archive_id", String(courseArchive.id)).eq("source_class_summary_id", String(summary.id)).eq("source_version_number", Number(summary.version_number)).maybeSingle();
  fail(existing.error, "Summary archive could not be checked.");
  if (existing.data) return existing.data;
  const prior = await supabase.from("alumni_summary_archive_items").select("*").eq("alumni_course_archive_id", String(courseArchive.id)).eq("class_session_id", String(session.id)).eq("archive_status", "active").order("source_version_number", { ascending: false }).limit(1).maybeSingle();
  fail(prior.error, "Prior summary archive version could not be checked.");
  const snapshot = { learning_objectives: summary.learning_objectives ?? [], key_teaching_points: summary.key_teaching_points ?? [], scripture_references: summary.key_scriptures_references ?? [], important_concepts: summary.important_concepts ?? [], practical_applications: summary.practical_applications ?? [], action_points: summary.action_points ?? [], recommended_resources: summary.recommended_resources ?? [], additional_notes: summary.additional_notes ?? null, source_published_at: summary.published_at };
  const saved = await supabase.from("alumni_summary_archive_items").insert({ alumni_course_archive_id: courseArchive.id, class_session_id: session.id, source_class_summary_id: summary.id, source_version_number: summary.version_number, session_title_snapshot: session.title, session_date_snapshot: session.scheduled_start_at, summary_title_snapshot: summary.title, summary_snapshot: snapshot, archive_status: "active", supersedes_archive_item_id: prior.data?.id ?? null }).select("*").single();
  fail(saved.error, "Published class summary could not be archived.");
  if (prior.data) {
    const superseded = await supabase.from("alumni_summary_archive_items").update({ archive_status: "superseded" }).eq("id", prior.data.id);
    fail(superseded.error, "The previous summary archive version could not be superseded.");
    await recordLmsAudit(supabase, { action: "alumni_summary_superseded", entityType: "alumni_summary_archive_item", entityId: prior.data.id, actorUserId: actor.actorUserId, metadata: { successor_archive_item_id: saved.data.id } });
  }
  await recordLmsAudit(supabase, { action: "alumni_summary_archived", entityType: "alumni_summary_archive_item", entityId: saved.data.id, actorUserId: actor.actorUserId, metadata: { source_version_number: summary.version_number } });
  return saved.data;
}
