import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createInstitutionalAnnouncementEmail } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/email";
import {
  applicationMatchesStudentRecipientStatus,
  cohortCanReceiveAnnouncements,
  institutionalAnnouncementAudiences,
  institutionalAnnouncementCohortScopes,
  institutionalAnnouncementStudentStatuses,
  isActiveAnnouncement,
  isCurrentStudentEnrollment,
  normalizeAnnouncementToken,
  normalizeRecipientEmail,
  summarizeAnnouncementRecipients,
  type AnnouncementRecipient,
  type InstitutionalAnnouncementAudience,
  type InstitutionalAnnouncementCohortScope,
  type InstitutionalAnnouncementStudentStatus,
} from "@/lib/lms/institutionalAnnouncements";
import { LmsAdminDataError } from "@/lib/lms/adminData";

type Row = Record<string, unknown>;
type Target = {
  audience: InstitutionalAnnouncementAudience;
  cohortScope: InstitutionalAnnouncementCohortScope;
  cohortId: string | null;
  studentRecipientStatus: InstitutionalAnnouncementStudentStatus;
  studentDiscipleshipRoute: string | null;
  studentSkillPathway: string | null;
  studentLearningMode: string | null;
  explicitStudentIds: string[];
  explicitFacilitatorIds: string[];
  publishToPortal: boolean;
  sendEmail: boolean;
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, maximum = 10_000) { return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : null; }
function required(value: unknown, message: string, maximum: number) { const result = text(value, maximum); if (!result) throw new LmsAdminDataError(message, 400); return result; }
function relation(value: unknown): Row { return Array.isArray(value) ? (value[0] as Row | undefined) ?? {} : value && typeof value === "object" ? value as Row : {}; }
function timestamp(value: unknown, label: string) { const candidate = text(value, 100); if (!candidate) return null; const parsed = new Date(candidate); if (!Number.isFinite(parsed.valueOf())) throw new LmsAdminDataError(`Enter a valid ${label}.`, 400); return parsed.toISOString(); }
function ids(value: unknown, label: string) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !uuidPattern.test(item))) throw new LmsAdminDataError(`Choose valid ${label}.`, 400);
  return [...new Set(value as string[])];
}
function audienceIncludes(audience: string, type: "student" | "facilitator") { return audience === `${type}s` || audience === "students_facilitators"; }
function safeUrl(value: unknown) { const candidate = text(value, 2000); if (!candidate) return null; if (candidate.startsWith("/")) return candidate; const parsed = new URL(candidate); if (parsed.protocol !== "https:") throw new LmsAdminDataError("Announcement links must use HTTPS or an internal portal path.", 400); return parsed.toString(); }

function targetFrom(input: Row): Target {
  const audience = required(input.audience, "Choose an announcement audience.", 40) as InstitutionalAnnouncementAudience;
  if (!(institutionalAnnouncementAudiences as readonly string[]).includes(audience)) throw new LmsAdminDataError("Choose a supported announcement audience.", 400);
  const cohortScope = (text(input.cohort_scope, 40) ?? (input.all_active_cohorts === true ? "active" : "specific")) as InstitutionalAnnouncementCohortScope;
  if (!(institutionalAnnouncementCohortScopes as readonly string[]).includes(cohortScope)) throw new LmsAdminDataError("Choose a supported cohort scope.", 400);
  const cohortId = cohortScope === "specific" ? text(input.cohort_id, 80) : null;
  if (cohortScope === "specific" && (!cohortId || !uuidPattern.test(cohortId))) throw new LmsAdminDataError("Choose a valid specific cohort.", 400);
  const studentRecipientStatus = (text(input.student_recipient_status, 60) ?? "confirmed_conditional") as InstitutionalAnnouncementStudentStatus;
  if (!(institutionalAnnouncementStudentStatuses as readonly string[]).includes(studentRecipientStatus)) throw new LmsAdminDataError("Choose a supported student recipient status.", 400);
  return {
    audience,
    cohortScope,
    cohortId,
    studentRecipientStatus,
    studentDiscipleshipRoute: text(input.student_discipleship_route, 40),
    studentSkillPathway: text(input.student_skill_pathway, 80),
    studentLearningMode: text(input.student_learning_mode, 40),
    explicitStudentIds: audienceIncludes(audience, "student") ? ids(input.explicit_student_ids, "explicit students") : [],
    explicitFacilitatorIds: audienceIncludes(audience, "facilitator") ? ids(input.explicit_facilitator_ids, "explicit facilitators") : [],
    publishToPortal: input.publish_to_portal !== false,
    sendEmail: input.send_email === true,
  };
}

function matchesCohort(target: Target, cohortId: unknown, cohortStatus: unknown) {
  if (typeof cohortId !== "string" || !cohortCanReceiveAnnouncements(cohortStatus, target.cohortScope)) return false;
  return target.cohortScope !== "specific" || cohortId === target.cohortId;
}

function matchesStudentFilters(target: Target, route: unknown, pathway: unknown, learningMode: unknown) {
  if (target.studentDiscipleshipRoute && normalizeAnnouncementToken(route) !== normalizeAnnouncementToken(target.studentDiscipleshipRoute)) return false;
  if (target.studentSkillPathway && normalizeAnnouncementToken(pathway) !== normalizeAnnouncementToken(target.studentSkillPathway)) return false;
  if (target.studentLearningMode && normalizeAnnouncementToken(learningMode) !== normalizeAnnouncementToken(target.studentLearningMode)) return false;
  return true;
}

async function validateTargetCohort(supabase: SupabaseClient, target: Target) {
  if (target.cohortScope !== "specific") return;
  const result = await supabase.from("cohorts").select("id, status").eq("id", target.cohortId).maybeSingle();
  if (result.error) throw new LmsAdminDataError("The selected cohort could not be checked.");
  if (!result.data) throw new LmsAdminDataError("The selected cohort was not found.", 404);
  if (!cohortCanReceiveAnnouncements(result.data.status, "specific")) {
    throw new LmsAdminDataError("The selected cohort is closed, archived, cancelled, or otherwise unavailable for current cohort communication.", 409);
  }
}

export async function fetchAnnouncementAdminOptions(supabase: SupabaseClient) {
  const [cohorts, students, facilitators] = await Promise.all([
    supabase.from("cohorts").select("id, code, name, status").order("start_date", { ascending: false, nullsFirst: false }),
    supabase.from("students").select("id, registration_id, legal_name, preferred_name, email, student_status, registrations(deleted_at), student_enrollments(id, cohort_id, enrolment_status)").order("legal_name"),
    supabase.from("facilitators").select("id, display_name, email, facilitator_status, active").order("display_name"),
  ]);
  if (cohorts.error || students.error || facilitators.error) throw new LmsAdminDataError("Announcement recipient options could not be loaded.");
  return {
    cohorts: (cohorts.data ?? []).filter((cohort) => cohortCanReceiveAnnouncements(cohort.status, "current_upcoming")),
    students: (students.data ?? []).filter((student) => student.student_status === "active" && student.email && !(student.registration_id && relation(student.registrations).deleted_at) && (student.student_enrollments ?? []).some((enrollment: Row) => isCurrentStudentEnrollment(enrollment.enrolment_status))).map((student) => ({ id: student.id, name: student.preferred_name || student.legal_name, email: student.email })),
    facilitators: (facilitators.data ?? []).filter((facilitator) => facilitator.active !== false && facilitator.facilitator_status === "active" && facilitator.email).map((facilitator) => ({ id: facilitator.id, name: facilitator.display_name, email: facilitator.email })),
  };
}

async function deriveRecipients(supabase: SupabaseClient, target: Target) {
  await validateTargetCohort(supabase, target);
  const [students, registrations, facilitators, facilitatorSessions] = await Promise.all([
    audienceIncludes(target.audience, "student")
      ? supabase.from("students").select("id, registration_id, legal_name, preferred_name, email, student_status, registrations(deleted_at), student_enrollments(id, cohort_id, discipleship_route, skill_pathway, skill_learning_mode, enrolment_status, cohorts(id, status))")
      : Promise.resolve({ data: [], error: null }),
    audienceIncludes(target.audience, "student") && target.studentRecipientStatus !== "enrolled_active" && !target.explicitStudentIds.length
      ? supabase.from("registrations").select("id, full_name, email, cohort_id, application_status, deleted_at, assigned_discipleship_route, skill_pathway, learning_mode, cohorts(id, status)").is("deleted_at", null).in("application_status", ["admitted", "conditional_admission_payment_outstanding"])
      : Promise.resolve({ data: [], error: null }),
    audienceIncludes(target.audience, "facilitator")
      ? supabase.from("facilitators").select("id, display_name, email, facilitator_status, active, facilitator_course_assignments(cohort_course_id, cohort_courses(cohort_id, cohorts(id, status)))")
      : Promise.resolve({ data: [], error: null }),
    audienceIncludes(target.audience, "facilitator")
      ? supabase.from("class_sessions").select("facilitator_id, cohort_courses(cohort_id, cohorts(id, status))").not("facilitator_id", "is", null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (students.error) throw new LmsAdminDataError("Student announcement recipients could not be derived.");
  if (registrations.error) throw new LmsAdminDataError("Admitted learner announcement recipients could not be derived.");
  if (facilitators.error) throw new LmsAdminDataError("Facilitator announcement recipients could not be derived.");
  if (facilitatorSessions.error) throw new LmsAdminDataError("Facilitator session assignments could not be derived.");

  const studentRecipients: AnnouncementRecipient[] = [];
  for (const student of students.data ?? []) {
    if (student.student_status !== "active" || !student.email || (student.registration_id && relation(student.registrations).deleted_at)) continue;
    if (target.explicitStudentIds.length && !target.explicitStudentIds.includes(student.id)) continue;
    for (const enrollment of (student.student_enrollments ?? []) as Row[]) {
      const cohort = relation(enrollment.cohorts);
      if (!isCurrentStudentEnrollment(enrollment.enrolment_status) || !matchesCohort(target, enrollment.cohort_id, cohort.status)) continue;
      if (!matchesStudentFilters(target, enrollment.discipleship_route, enrollment.skill_pathway, enrollment.skill_learning_mode)) continue;
      studentRecipients.push({ recipientType: "student", studentId: student.id, registrationId: student.registration_id, facilitatorId: null, name: String(student.preferred_name || student.legal_name), email: student.email, cohortId: String(enrollment.cohort_id), recipientClass: "confirmed", portalVisible: true, explicit: target.explicitStudentIds.includes(student.id) });
      break;
    }
  }

  const matchedStudentIds = new Set(studentRecipients.map((recipient) => recipient.studentId));
  if (target.explicitStudentIds.some((id) => !matchedStudentIds.has(id))) throw new LmsAdminDataError("One or more explicitly selected students are not eligible for the selected cohort and filters.", 409);

  const learnerByEmail = new Map<string, AnnouncementRecipient>();
  for (const recipient of studentRecipients) learnerByEmail.set(normalizeRecipientEmail(recipient.email), recipient);
  const provisionedRegistrationIds = new Set((students.data ?? []).map((student) => student.registration_id).filter(Boolean));
  const admittedFirst = [...(registrations.data ?? [])].sort((a, b) => Number(b.application_status === "admitted") - Number(a.application_status === "admitted"));
  for (const registration of admittedFirst) {
    const cohort = relation(registration.cohorts);
    if (!registration.email || registration.deleted_at || provisionedRegistrationIds.has(registration.id)) continue;
    if (!applicationMatchesStudentRecipientStatus(registration.application_status, target.studentRecipientStatus)) continue;
    if (!matchesCohort(target, registration.cohort_id, cohort.status)) continue;
    if (!matchesStudentFilters(target, registration.assigned_discipleship_route, registration.skill_pathway, registration.learning_mode)) continue;
    const email = normalizeRecipientEmail(registration.email);
    if (learnerByEmail.has(email)) continue;
    learnerByEmail.set(email, { recipientType: "applicant", studentId: null, registrationId: registration.id, facilitatorId: null, name: String(registration.full_name), email: registration.email, cohortId: String(registration.cohort_id), recipientClass: registration.application_status === "admitted" ? "confirmed" : "conditional", portalVisible: false, explicit: false });
  }

  const facilitatorByEmail = new Map<string, AnnouncementRecipient>();
  const sessionsByFacilitator = new Map<string, Row[]>();
  for (const session of facilitatorSessions.data ?? []) {
    if (typeof session.facilitator_id !== "string") continue;
    sessionsByFacilitator.set(session.facilitator_id, [...(sessionsByFacilitator.get(session.facilitator_id) ?? []), session as Row]);
  }
  for (const facilitator of facilitators.data ?? []) {
    if (facilitator.active === false || facilitator.facilitator_status !== "active" || !facilitator.email) continue;
    if (target.explicitFacilitatorIds.length && !target.explicitFacilitatorIds.includes(facilitator.id)) continue;
    const offerings = [
      ...((facilitator.facilitator_course_assignments ?? []) as Row[]).map((assignment) => relation(assignment.cohort_courses)),
      ...(sessionsByFacilitator.get(facilitator.id) ?? []).map((session) => relation(session.cohort_courses)),
    ];
    for (const offering of offerings) {
      const cohort = relation(offering.cohorts);
      if (!matchesCohort(target, offering.cohort_id, cohort.status)) continue;
      facilitatorByEmail.set(normalizeRecipientEmail(facilitator.email), { recipientType: "facilitator", studentId: null, registrationId: null, facilitatorId: facilitator.id, name: String(facilitator.display_name), email: facilitator.email, cohortId: String(offering.cohort_id), recipientClass: "facilitator", portalVisible: true, explicit: target.explicitFacilitatorIds.includes(facilitator.id) });
      break;
    }
  }
  const matchedFacilitatorIds = new Set([...facilitatorByEmail.values()].map((recipient) => recipient.facilitatorId));
  if (target.explicitFacilitatorIds.some((id) => !matchedFacilitatorIds.has(id))) throw new LmsAdminDataError("One or more explicitly selected facilitators are not actively assigned to the selected cohort scope.", 409);
  return [...learnerByEmail.values(), ...facilitatorByEmail.values()];
}

function previewToken(recipients: AnnouncementRecipient[], target: Target) {
  const identities = recipients.map((recipient) => `${recipient.recipientType}:${recipient.studentId ?? recipient.registrationId ?? recipient.facilitatorId}:${normalizeRecipientEmail(recipient.email)}:${recipient.cohortId}`).sort();
  return createHash("sha256").update(JSON.stringify({ identities, publishToPortal: target.publishToPortal, sendEmail: target.sendEmail })).digest("hex");
}

function zeroRecipientError(target: Target) {
  if (target.audience === "students" && target.studentRecipientStatus === "enrolled_active") return new LmsAdminDataError("No enrolled or active students currently match the selected cohort and filters.", 409);
  if (target.audience === "students" && target.studentRecipientStatus === "confirmed_active") return new LmsAdminDataError("No enrolled, active, or admitted students currently match the selected cohort and filters.", 409);
  if (target.audience === "students") return new LmsAdminDataError("No confirmed or conditional learners currently match the selected cohort and filters.", 409);
  if (target.audience === "facilitators") return new LmsAdminDataError("No facilitators are assigned to the selected cohort scope.", 409);
  return new LmsAdminDataError("No confirmed or conditional learners or assigned facilitators currently match the selected cohort and filters.", 409);
}

async function resolvePreview(supabase: SupabaseClient, target: Target) {
  const recipients = await deriveRecipients(supabase, target);
  if (!recipients.length) throw zeroRecipientError(target);
  return { recipients, preview: summarizeAnnouncementRecipients(recipients, target.publishToPortal), previewToken: previewToken(recipients, target) };
}

function requireMatchingPreview(input: Row, actualToken: string) {
  const supplied = text(input.recipient_preview_token, 100);
  if (!supplied) throw new LmsAdminDataError("Preview recipients before publishing or sending this announcement.", 409);
  if (supplied !== actualToken) throw new LmsAdminDataError("Recipients changed since the preview. Preview again before publishing or sending.", 409);
}

async function saveRecipientSnapshot(supabase: SupabaseClient, announcement: Row, recipients: AnnouncementRecipient[]) {
  const rows = recipients.map((recipient) => ({
    announcement_id: announcement.id,
    recipient_type: recipient.recipientType,
    student_id: recipient.studentId,
    registration_id: recipient.recipientType === "applicant" ? recipient.registrationId : null,
    facilitator_id: recipient.facilitatorId,
    recipient_name_snapshot: recipient.name,
    recipient_email_snapshot: normalizeRecipientEmail(recipient.email),
    recipient_class: recipient.recipientClass,
    portal_visible: recipient.portalVisible,
    cohort_id: recipient.cohortId,
    explicit_selection: recipient.explicit,
    email_status: announcement.send_email ? "pending" : "not_requested",
  }));
  const saved = await supabase.from("institutional_announcement_recipients").insert(rows);
  if (saved.error) throw new LmsAdminDataError("Announcement recipients could not be preserved.");
}

export async function previewInstitutionalAnnouncement(supabase: SupabaseClient, body: Row) {
  const resolved = await resolvePreview(supabase, targetFrom(body));
  return { preview: resolved.preview, previewToken: resolved.previewToken };
}

export async function previewDraftInstitutionalAnnouncement(supabase: SupabaseClient, announcementId: string) {
  const current = await supabase.from("institutional_announcements").select("*").eq("id", announcementId).eq("announcement_status", "draft").maybeSingle();
  if (current.error || !current.data) throw new LmsAdminDataError("Draft announcement not found.", 404);
  const resolved = await resolvePreview(supabase, targetFrom(current.data));
  return { preview: resolved.preview, previewToken: resolved.previewToken };
}

export async function sendInstitutionalAnnouncementEmails(supabase: SupabaseClient, announcementId: string, failedOnly = false) {
  const announcementResult = await supabase.from("institutional_announcements").select("*").eq("id", announcementId).eq("announcement_status", "published").maybeSingle();
  if (announcementResult.error || !announcementResult.data) throw new LmsAdminDataError("Published announcement not found.", 404);
  let query = supabase.from("institutional_announcement_recipients").select("*").eq("announcement_id", announcementId);
  query = failedOnly ? query.eq("email_status", "failed") : query.in("email_status", ["pending", "failed"]);
  const recipientResult = await query.order("created_at");
  if (recipientResult.error) throw new LmsAdminDataError("Announcement email queue could not be loaded.");
  const byEmail = new Map<string, Row[]>();
  for (const recipient of recipientResult.data ?? []) {
    const email = normalizeRecipientEmail(String(recipient.recipient_email_snapshot));
    byEmail.set(email, [...(byEmail.get(email) ?? []), recipient]);
  }
  let sent = 0; let failed = 0;
  for (const [email, recipientRows] of byEmail) {
    const template = createInstitutionalAnnouncementEmail({ ...announcementResult.data, recipientName: String(recipientRows[0].recipient_name_snapshot) });
    const nextAttempt = Math.max(...recipientRows.map((recipient) => Number(recipient.email_attempt_count || 0))) + 1;
    const result = await sendEmail({ to: email, subject: template.subject, html: template.html, text: template.text, idempotencyKey: `realms-announcement-${announcementId}-${email}-${nextAttempt}` });
    const now = new Date().toISOString();
    const update = result.sent ? { email_status: "sent", email_provider_message_id: result.id ?? null, email_error_internal: null, email_last_attempted_at: now, email_sent_at: now } : { email_status: "failed", email_provider_message_id: null, email_error_internal: result.reason.slice(0, 1000), email_last_attempted_at: now };
    for (const recipient of recipientRows) await supabase.from("institutional_announcement_recipients").update({ ...update, email_attempt_count: Number(recipient.email_attempt_count || 0) + 1 }).eq("id", recipient.id);
    if (result.sent) sent += 1; else failed += 1;
  }
  return { attempted: byEmail.size, sent, failed };
}

export async function createInstitutionalAnnouncement(supabase: SupabaseClient, body: Row, actor = "REALMS Admin") {
  const target = targetFrom(body);
  await validateTargetCohort(supabase, target);
  const status = body.announcement_status === "published" ? "published" : "draft";
  const ctaUrl = safeUrl(body.call_to_action_url);
  const ctaLabel = ctaUrl ? required(body.call_to_action_label, "Add a label for the announcement link.", 120) : null;
  const pinnedUntil = timestamp(body.pinned_until, "pinned-until date");
  const expiresAt = timestamp(body.expires_at, "expiry date");
  if (pinnedUntil && expiresAt && Date.parse(pinnedUntil) > Date.parse(expiresAt)) throw new LmsAdminDataError("Pinned until cannot be later than the announcement expiry.", 400);
  const resolved = status === "published" ? await resolvePreview(supabase, target) : null;
  if (resolved) requireMatchingPreview(body, resolved.previewToken);
  const record = {
    title: required(body.title, "Announcement title is required.", 240), message: required(body.message, "Announcement message is required.", 10_000), audience: target.audience,
    cohort_id: target.cohortId, all_active_cohorts: target.cohortScope !== "specific", cohort_scope: target.cohortScope,
    student_recipient_status: target.studentRecipientStatus, explicit_student_ids: target.explicitStudentIds, explicit_facilitator_ids: target.explicitFacilitatorIds,
    student_discipleship_route: target.studentDiscipleshipRoute, student_skill_pathway: target.studentSkillPathway, student_learning_mode: target.studentLearningMode,
    call_to_action_label: ctaLabel, call_to_action_url: ctaUrl,
    publish_to_portal: target.publishToPortal, send_email: target.sendEmail,
    announcement_status: "draft", pinned_until: pinnedUntil, expires_at: expiresAt, published_at: null, created_by: actor,
  };
  const saved = await supabase.from("institutional_announcements").insert(record).select("*").single();
  if (saved.error || !saved.data) throw new LmsAdminDataError("Announcement could not be saved.");
  let announcement = saved.data;
  if (resolved) {
    await saveRecipientSnapshot(supabase, saved.data, resolved.recipients);
    const publishedAt = new Date().toISOString();
    const published = await supabase.from("institutional_announcements").update({ announcement_status: "published", published_at: publishedAt, updated_at: publishedAt }).eq("id", saved.data.id).eq("announcement_status", "draft").select("*").maybeSingle();
    if (published.error || !published.data) throw new LmsAdminDataError("The announcement was saved as a draft, but could not be published safely.", 409);
    announcement = published.data;
  }
  const delivery = resolved && announcement.send_email ? await sendInstitutionalAnnouncementEmails(supabase, announcement.id) : null;
  return { announcement, recipientCount: resolved?.recipients.length ?? 0, recipientPreview: resolved?.preview ?? null, delivery };
}

export async function publishInstitutionalAnnouncement(supabase: SupabaseClient, announcementId: string, body: Row = {}) {
  const current = await supabase.from("institutional_announcements").select("*").eq("id", announcementId).eq("announcement_status", "draft").maybeSingle();
  if (current.error || !current.data) throw new LmsAdminDataError("Draft announcement not found.", 404);
  const resolved = await resolvePreview(supabase, targetFrom(current.data));
  requireMatchingPreview(body, resolved.previewToken);
  const cleared = await supabase.from("institutional_announcement_recipients").delete().eq("announcement_id", announcementId);
  if (cleared.error) throw new LmsAdminDataError("Draft announcement recipients could not be refreshed safely.");
  await saveRecipientSnapshot(supabase, current.data, resolved.recipients);
  const publishedAt = new Date().toISOString();
  const saved = await supabase.from("institutional_announcements").update({ announcement_status: "published", published_at: publishedAt, updated_at: publishedAt }).eq("id", announcementId).eq("announcement_status", "draft").select("*").maybeSingle();
  if (saved.error || !saved.data) throw new LmsAdminDataError("Announcement could not be published safely.", 409);
  const delivery = saved.data.send_email ? await sendInstitutionalAnnouncementEmails(supabase, announcementId) : null;
  return { announcement: saved.data, recipientCount: resolved.recipients.length, recipientPreview: resolved.preview, delivery };
}

export async function archiveInstitutionalAnnouncement(supabase: SupabaseClient, announcementId: string) {
  const now = new Date().toISOString();
  const saved = await supabase.from("institutional_announcements").update({ announcement_status: "archived", archived_at: now, updated_at: now }).eq("id", announcementId).in("announcement_status", ["draft", "published"]).select("*").maybeSingle();
  if (saved.error || !saved.data) throw new LmsAdminDataError("Announcement could not be archived.", 404);
  return saved.data;
}

export async function fetchAdminInstitutionalAnnouncements(supabase: SupabaseClient) {
  const result = await supabase.from("institutional_announcements").select("*, institutional_announcement_recipients(id, recipient_type, student_id, registration_id, facilitator_id, recipient_name_snapshot, recipient_email_snapshot, recipient_class, portal_visible, cohort_id, explicit_selection, email_status, email_sent_at)").order("created_at", { ascending: false });
  if (result.error) throw new LmsAdminDataError("Announcements could not be loaded.");
  return (result.data ?? []).map((announcement) => {
    const rows = (announcement.institutional_announcement_recipients ?? []) as Row[];
    const recipients: AnnouncementRecipient[] = rows.map((row) => ({ recipientType: String(row.recipient_type) as AnnouncementRecipient["recipientType"], studentId: typeof row.student_id === "string" ? row.student_id : null, registrationId: typeof row.registration_id === "string" ? row.registration_id : null, facilitatorId: typeof row.facilitator_id === "string" ? row.facilitator_id : null, name: String(row.recipient_name_snapshot), email: String(row.recipient_email_snapshot), cohortId: String(row.cohort_id), recipientClass: (row.recipient_class ?? (row.recipient_type === "facilitator" ? "facilitator" : "confirmed")) as AnnouncementRecipient["recipientClass"], portalVisible: row.portal_visible !== false && row.recipient_type !== "applicant", explicit: row.explicit_selection === true }));
    const deliveryByEmail = new Map<string, string>();
    for (const row of rows) {
      const email = normalizeRecipientEmail(String(row.recipient_email_snapshot));
      const status = String(row.email_status);
      const current = deliveryByEmail.get(email);
      if (!current || status === "failed" || (status === "sent" && current !== "failed")) deliveryByEmail.set(email, status);
    }
    return {
      ...announcement,
      institutional_announcement_recipients: rows.map((row) => ({ id: row.id, email_status: row.email_status, email_sent_at: row.email_sent_at })),
      recipient_summary: summarizeAnnouncementRecipients(recipients, announcement.publish_to_portal !== false),
      delivery_summary: { sent: [...deliveryByEmail.values()].filter((status) => status === "sent").length, failed: [...deliveryByEmail.values()].filter((status) => status === "failed").length },
    };
  });
}

async function fetchOwnAnnouncements(supabase: SupabaseClient, recipientColumn: "student_id" | "facilitator_id", recipientId: string) {
  const recipientResult = await supabase.from("institutional_announcement_recipients").select("announcement_id").eq(recipientColumn, recipientId);
  if (recipientResult.error) throw new LmsAdminDataError("Announcements could not be loaded.");
  const announcementIds = (recipientResult.data ?? []).map((row) => row.announcement_id);
  if (!announcementIds.length) return [];
  const result = await supabase.from("institutional_announcements").select("id, title, message, audience, call_to_action_label, call_to_action_url, pinned_until, expires_at, published_at, announcement_status, publish_to_portal").in("id", announcementIds).order("published_at", { ascending: false });
  if (result.error) throw new LmsAdminDataError("Announcements could not be loaded.");
  return (result.data ?? []).filter((announcement) => isActiveAnnouncement(announcement));
}

export async function fetchStudentInstitutionalAnnouncements(supabase: SupabaseClient, profileId: string) {
  const student = await supabase.from("students").select("id, student_status").eq("profile_id", profileId).maybeSingle();
  if (student.error || !student.data || student.data.student_status !== "active") return [];
  return fetchOwnAnnouncements(supabase, "student_id", student.data.id);
}

export async function fetchFacilitatorInstitutionalAnnouncements(supabase: SupabaseClient, profileId: string) {
  const facilitator = await supabase.from("facilitators").select("id, facilitator_status, active").eq("profile_id", profileId).maybeSingle();
  if (facilitator.error || !facilitator.data || facilitator.data.facilitator_status !== "active" || facilitator.data.active === false) return [];
  return fetchOwnAnnouncements(supabase, "facilitator_id", facilitator.data.id);
}
