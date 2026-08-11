import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createInstitutionalAnnouncementEmail } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/email";
import { institutionalAnnouncementAudiences, isActiveAnnouncement, normalizeRecipientEmail, type InstitutionalAnnouncementAudience } from "@/lib/lms/institutionalAnnouncements";
import { LmsAdminDataError } from "@/lib/lms/adminData";

type Row = Record<string, unknown>;
type Recipient = { recipientType: "student" | "facilitator"; studentId: string | null; facilitatorId: string | null; name: string; email: string; cohortId: string | null; explicit: boolean };
const activeCohortStatuses = new Set(["active", "current", "in_progress"]);
const activeEnrollmentStatuses = new Set(["active", "enrolled"]);

function text(value: unknown, maximum = 10_000) { return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : null; }
function required(value: unknown, message: string, maximum: number) { const result = text(value, maximum); if (!result) throw new LmsAdminDataError(message, 400); return result; }
function relation(value: unknown): Row { return Array.isArray(value) ? (value[0] as Row | undefined) ?? {} : value && typeof value === "object" ? value as Row : {}; }
function timestamp(value: unknown, label: string) { const candidate = text(value, 100); if (!candidate) return null; const parsed = new Date(candidate); if (!Number.isFinite(parsed.valueOf())) throw new LmsAdminDataError(`Enter a valid ${label}.`, 400); return parsed.toISOString(); }
function ids(value: unknown) { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && /^[0-9a-f-]{36}$/i.test(item)))] : []; }
function audienceIncludes(audience: string, type: "student" | "facilitator") { return audience === `${type}s` || audience === "students_facilitators"; }
function safeUrl(value: unknown) { const candidate = text(value, 2000); if (!candidate) return null; if (candidate.startsWith("/")) return candidate; const parsed = new URL(candidate); if (parsed.protocol !== "https:") throw new LmsAdminDataError("Announcement links must use HTTPS or an internal portal path.", 400); return parsed.toString(); }

export async function fetchAnnouncementAdminOptions(supabase: SupabaseClient) {
  const [cohorts, students, facilitators] = await Promise.all([
    supabase.from("cohorts").select("id, code, name, status").order("start_date", { ascending: false, nullsFirst: false }),
    supabase.from("students").select("id, registration_id, legal_name, preferred_name, email, student_status, registrations(deleted_at), student_enrollments(id, cohort_id, discipleship_route, skill_pathway, skill_learning_mode, enrolment_status, cohorts(id, code, name, status))").order("legal_name"),
    supabase.from("facilitators").select("id, display_name, email, facilitator_status, active, facilitator_course_assignments(cohort_course_id, cohort_courses(cohort_id, cohorts(id, code, name, status)))").order("display_name"),
  ]);
  if (cohorts.error || students.error || facilitators.error) throw new LmsAdminDataError("Announcement recipient options could not be loaded.");
  return {
    cohorts: cohorts.data ?? [],
    students: (students.data ?? []).filter((student) => student.student_status === "active" && !(student.registration_id && relation(student.registrations).deleted_at) && (student.student_enrollments ?? []).some((enrollment: Row) => activeEnrollmentStatuses.has(String(enrollment.enrolment_status)))).map((student) => ({ id: student.id, name: student.preferred_name || student.legal_name, email: student.email })),
    facilitators: (facilitators.data ?? []).filter((facilitator) => facilitator.active !== false && facilitator.facilitator_status === "active" && facilitator.email).map((facilitator) => ({ id: facilitator.id, name: facilitator.display_name, email: facilitator.email })),
  };
}

async function deriveRecipients(supabase: SupabaseClient, announcement: Row, explicitStudentIds: string[], explicitFacilitatorIds: string[]) {
  const audience = String(announcement.audience);
  const cohortId = typeof announcement.cohort_id === "string" ? announcement.cohort_id : null;
  const allActive = announcement.all_active_cohorts === true;
  const recipients: Recipient[] = [];
  if (audienceIncludes(audience, "student")) {
    const result = await supabase.from("students").select("id, registration_id, legal_name, preferred_name, email, student_status, registrations(deleted_at), student_enrollments(id, cohort_id, discipleship_route, skill_pathway, skill_learning_mode, enrolment_status, cohorts(id, status))");
    if (result.error) throw new LmsAdminDataError("Student announcement recipients could not be derived.");
    for (const student of result.data ?? []) {
      if (student.student_status !== "active" || !student.email || (student.registration_id && relation(student.registrations).deleted_at)) continue;
      if (explicitStudentIds.length && !explicitStudentIds.includes(student.id)) continue;
      const enrollments = (student.student_enrollments ?? []) as Row[];
      const match = enrollments.find((enrollment) => {
        const cohort = relation(enrollment.cohorts);
        if (!activeEnrollmentStatuses.has(String(enrollment.enrolment_status))) return false;
        if (cohortId && enrollment.cohort_id !== cohortId) return false;
        if (allActive && !activeCohortStatuses.has(String(cohort.status))) return false;
        if (announcement.student_discipleship_route && enrollment.discipleship_route !== announcement.student_discipleship_route) return false;
        if (announcement.student_skill_pathway && enrollment.skill_pathway !== announcement.student_skill_pathway) return false;
        if (announcement.student_learning_mode && enrollment.skill_learning_mode !== announcement.student_learning_mode) return false;
        return true;
      });
      if (!match) continue;
      recipients.push({ recipientType: "student", studentId: student.id, facilitatorId: null, name: String(student.preferred_name || student.legal_name), email: student.email, cohortId: String(match.cohort_id), explicit: explicitStudentIds.includes(student.id) });
    }
  }
  if (audienceIncludes(audience, "facilitator")) {
    const result = await supabase.from("facilitators").select("id, display_name, email, facilitator_status, active, facilitator_course_assignments(cohort_course_id, cohort_courses(cohort_id, cohorts(id, status)))");
    if (result.error) throw new LmsAdminDataError("Facilitator announcement recipients could not be derived.");
    for (const facilitator of result.data ?? []) {
      if (facilitator.active === false || facilitator.facilitator_status !== "active" || !facilitator.email) continue;
      if (explicitFacilitatorIds.length && !explicitFacilitatorIds.includes(facilitator.id)) continue;
      const assignments = (facilitator.facilitator_course_assignments ?? []) as Row[];
      const match = assignments.find((assignment) => {
        const offering = relation(assignment.cohort_courses);
        const cohort = relation(offering.cohorts);
        if (cohortId && offering.cohort_id !== cohortId) return false;
        return !allActive || activeCohortStatuses.has(String(cohort.status));
      });
      if (!match) continue;
      const offering = relation(match.cohort_courses);
      recipients.push({ recipientType: "facilitator", studentId: null, facilitatorId: facilitator.id, name: facilitator.display_name, email: facilitator.email, cohortId: String(offering.cohort_id), explicit: explicitFacilitatorIds.includes(facilitator.id) });
    }
  }
  return recipients;
}

async function saveRecipientSnapshot(supabase: SupabaseClient, announcement: Row, explicitStudentIds: string[], explicitFacilitatorIds: string[]) {
  const recipients = await deriveRecipients(supabase, announcement, explicitStudentIds, explicitFacilitatorIds);
  if (!recipients.length) throw new LmsAdminDataError("No active REALMS students or facilitators match this announcement audience.", 409);
  const rows = recipients.map((recipient) => ({
    announcement_id: announcement.id,
    recipient_type: recipient.recipientType,
    student_id: recipient.studentId,
    facilitator_id: recipient.facilitatorId,
    recipient_name_snapshot: recipient.name,
    recipient_email_snapshot: normalizeRecipientEmail(recipient.email),
    cohort_id: recipient.cohortId,
    explicit_selection: recipient.explicit,
    email_status: announcement.send_email ? "pending" : "not_requested",
  }));
  const saved = await supabase.from("institutional_announcement_recipients").upsert(rows, { onConflict: "announcement_id,recipient_type,student_id,facilitator_id", ignoreDuplicates: true });
  if (saved.error) throw new LmsAdminDataError("Announcement recipients could not be preserved.");
  return recipients.length;
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
  const audience = required(body.audience, "Choose an announcement audience.", 40) as InstitutionalAnnouncementAudience;
  if (!(institutionalAnnouncementAudiences as readonly string[]).includes(audience)) throw new LmsAdminDataError("Choose a supported announcement audience.", 400);
  const cohortId = text(body.cohort_id, 80);
  const allActiveCohorts = body.all_active_cohorts === true;
  if (!cohortId && !allActiveCohorts) throw new LmsAdminDataError("Choose a specific cohort or all applicable active cohorts.", 400);
  if (cohortId && !/^[0-9a-f-]{36}$/i.test(cohortId)) throw new LmsAdminDataError("Choose a valid cohort.", 400);
  const status = body.announcement_status === "published" ? "published" : "draft";
  const ctaUrl = safeUrl(body.call_to_action_url);
  const ctaLabel = ctaUrl ? required(body.call_to_action_label, "Add a label for the announcement link.", 120) : null;
  const pinnedUntil = timestamp(body.pinned_until, "pinned-until date");
  const expiresAt = timestamp(body.expires_at, "expiry date");
  if (pinnedUntil && expiresAt && Date.parse(pinnedUntil) > Date.parse(expiresAt)) throw new LmsAdminDataError("Pinned until cannot be later than the announcement expiry.", 400);
  const publishedAt = status === "published" ? new Date().toISOString() : null;
  const saved = await supabase.from("institutional_announcements").insert({
    title: required(body.title, "Announcement title is required.", 240), message: required(body.message, "Announcement message is required.", 10_000), audience,
    cohort_id: cohortId, all_active_cohorts: allActiveCohorts,
    student_discipleship_route: text(body.student_discipleship_route, 40), student_skill_pathway: text(body.student_skill_pathway, 80), student_learning_mode: text(body.student_learning_mode, 40),
    call_to_action_label: ctaLabel, call_to_action_url: ctaUrl,
    publish_to_portal: body.publish_to_portal !== false, send_email: body.send_email === true,
    announcement_status: status, pinned_until: pinnedUntil, expires_at: expiresAt, published_at: publishedAt, created_by: actor,
  }).select("*").single();
  if (saved.error || !saved.data) throw new LmsAdminDataError("Announcement could not be saved.");
  const explicitStudentIds = ids(body.explicit_student_ids); const explicitFacilitatorIds = ids(body.explicit_facilitator_ids);
  let recipientCount: number;
  try {
    recipientCount = await saveRecipientSnapshot(supabase, saved.data, explicitStudentIds, explicitFacilitatorIds);
  } catch (error) {
    await supabase.from("institutional_announcements").delete().eq("id", saved.data.id);
    throw error;
  }
  let delivery = null;
  if (status === "published" && saved.data.send_email) delivery = await sendInstitutionalAnnouncementEmails(supabase, saved.data.id);
  return { announcement: saved.data, recipientCount, delivery };
}

export async function publishInstitutionalAnnouncement(supabase: SupabaseClient, announcementId: string) {
  const current = await supabase.from("institutional_announcements").select("*").eq("id", announcementId).eq("announcement_status", "draft").maybeSingle();
  if (current.error || !current.data) throw new LmsAdminDataError("Draft announcement not found.", 404);
  const priorRecipients = await supabase.from("institutional_announcement_recipients").select("student_id, facilitator_id, explicit_selection").eq("announcement_id", announcementId);
  if (priorRecipients.error) throw new LmsAdminDataError("Draft announcement recipients could not be checked.");
  const explicitStudentIds = (priorRecipients.data ?? []).filter((row) => row.explicit_selection && row.student_id).map((row) => String(row.student_id));
  const explicitFacilitatorIds = (priorRecipients.data ?? []).filter((row) => row.explicit_selection && row.facilitator_id).map((row) => String(row.facilitator_id));
  const cleared = await supabase.from("institutional_announcement_recipients").delete().eq("announcement_id", announcementId);
  if (cleared.error) throw new LmsAdminDataError("Draft announcement recipients could not be refreshed safely.");
  const recipientCount = await saveRecipientSnapshot(supabase, current.data, explicitStudentIds, explicitFacilitatorIds);
  const publishedAt = new Date().toISOString();
  const saved = await supabase.from("institutional_announcements").update({ announcement_status: "published", published_at: publishedAt, updated_at: publishedAt }).eq("id", announcementId).eq("announcement_status", "draft").select("*").maybeSingle();
  if (saved.error || !saved.data) throw new LmsAdminDataError("Announcement could not be published safely.", 409);
  const delivery = saved.data.send_email ? await sendInstitutionalAnnouncementEmails(supabase, announcementId) : null;
  return { announcement: saved.data, recipientCount, delivery };
}

export async function archiveInstitutionalAnnouncement(supabase: SupabaseClient, announcementId: string) {
  const now = new Date().toISOString();
  const saved = await supabase.from("institutional_announcements").update({ announcement_status: "archived", archived_at: now, updated_at: now }).eq("id", announcementId).in("announcement_status", ["draft", "published"]).select("*").maybeSingle();
  if (saved.error || !saved.data) throw new LmsAdminDataError("Announcement could not be archived.", 404);
  return saved.data;
}

export async function fetchAdminInstitutionalAnnouncements(supabase: SupabaseClient) {
  const result = await supabase.from("institutional_announcements").select("*, institutional_announcement_recipients(id, email_status, email_sent_at)").order("created_at", { ascending: false });
  if (result.error) throw new LmsAdminDataError("Announcements could not be loaded.");
  return result.data ?? [];
}

async function fetchOwnAnnouncements(supabase: SupabaseClient, recipientColumn: "student_id" | "facilitator_id", recipientId: string) {
  const recipientResult = await supabase.from("institutional_announcement_recipients").select("announcement_id").eq(recipientColumn, recipientId);
  if (recipientResult.error) throw new LmsAdminDataError("Announcements could not be loaded.");
  const ids = (recipientResult.data ?? []).map((row) => row.announcement_id);
  if (!ids.length) return [];
  const result = await supabase.from("institutional_announcements").select("id, title, message, audience, call_to_action_label, call_to_action_url, pinned_until, expires_at, published_at, announcement_status, publish_to_portal").in("id", ids).order("published_at", { ascending: false });
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
