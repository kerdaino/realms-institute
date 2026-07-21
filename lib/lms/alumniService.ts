import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { LmsAdminDataError } from "@/lib/lms/adminData";
import { alumniOutcomeTypes, announcementScopes, announcementTypes } from "@/lib/lms/graduation";
import type { GraduationActor } from "@/lib/lms/graduationService";
import { resolveOwnAlumni } from "@/lib/lms/alumniData";

type Row = Record<string, unknown>;
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function requiredText(value: unknown, message: string, minimum = 1, maximum = 5_000) { const result = text(value); if (!result || result.length < minimum) throw new LmsAdminDataError(message, 400); return result.slice(0, maximum); }
function fail(error: { code?: string } | null, message: string) { if (error) throw new LmsAdminDataError(message); }
function bool(value: unknown) { return value === true || value === "true" || value === "on"; }
function actorReference(actor: GraduationActor) { return actor.actorUserId ?? actor.actorLabel; }
function timestamp(value: unknown) { const candidate = text(value); if (!candidate) return null; const parsed = new Date(candidate); if (!Number.isFinite(parsed.valueOf())) throw new LmsAdminDataError("Enter a valid date and time.", 400); return parsed.toISOString(); }

export async function saveAlumniAnnouncement(supabase: SupabaseClient, body: Row, actor: GraduationActor) {
  const type = requiredText(body.announcement_type, "Choose an announcement type.", 1, 80); const scope = requiredText(body.target_scope, "Choose an announcement audience.", 1, 80); const status = requiredText(body.announcement_status, "Choose draft or published status.", 1, 20);
  if (!(announcementTypes as readonly string[]).includes(type)) throw new LmsAdminDataError("Choose a supported announcement type.", 400);
  if (!(announcementScopes as readonly string[]).includes(scope)) throw new LmsAdminDataError("Choose a supported alumni audience.", 400);
  if (!["draft", "published"].includes(status)) throw new LmsAdminDataError("Choose draft or published status.", 400);
  const targetValue = scope === "all_alumni" ? null : requiredText(body.target_value, "Record the cohort, route or pathway target value.", 1, 200);
  const ctaUrl = text(body.call_to_action_url); if (ctaUrl && !ctaUrl.startsWith("/")) { const parsed = new URL(ctaUrl); if (!["https:", "http:"].includes(parsed.protocol)) throw new LmsAdminDataError("Use a safe web link for the call to action.", 400); }
  const saved = await supabase.from("alumni_announcements").insert({ title: requiredText(body.title, "Announcement title is required.", 3, 240), summary: requiredText(body.summary, "A short announcement summary is required.", 5, 500), body: requiredText(body.body, "Announcement details are required.", 20, 10_000), announcement_type: type, target_scope: scope, target_value: targetValue, call_to_action_label: ctaUrl ? requiredText(body.call_to_action_label, "Add a label for the announcement link.", 2, 120) : null, call_to_action_url: ctaUrl, announcement_status: status, published_at: status === "published" ? new Date().toISOString() : null, expires_at: timestamp(body.expires_at), created_by: actorReference(actor) }).select("*").single();
  fail(saved.error, "Alumni announcement could not be saved.");
  if (status === "published") await recordLmsAudit(supabase, { action: "alumni_announcement_published", entityType: "alumni_announcement", entityId: saved.data.id, actorUserId: actor.actorUserId, metadata: { target_scope: scope, announcement_type: type } });
  return saved.data;
}

export async function markOwnAnnouncementRead(supabase: SupabaseClient, announcementId: string, profileId: string) {
  const alumni = await resolveOwnAlumni(supabase, profileId);
  const announcement = await supabase.from("alumni_announcements").select("id, announcement_status, published_at, expires_at").eq("id", announcementId).maybeSingle(); fail(announcement.error, "Announcement could not be loaded.");
  if (!announcement.data || announcement.data.announcement_status !== "published" || !announcement.data.published_at || (announcement.data.expires_at && new Date(announcement.data.expires_at).valueOf() <= Date.now())) throw new LmsAdminDataError("This announcement is not available.", 404);
  const saved = await supabase.from("alumni_announcement_reads").upsert({ alumni_announcement_id: announcementId, alumni_id: alumni.id, read_at: new Date().toISOString() }, { onConflict: "alumni_announcement_id,alumni_id" }); fail(saved.error, "Announcement read status could not be saved.");
}

export async function submitOwnAlumniOutcome(supabase: SupabaseClient, profileId: string, body: Row) {
  const alumni = await resolveOwnAlumni(supabase, profileId); const type = requiredText(body.outcome_type, "Choose an outcome type.", 1, 80);
  if (!(alumniOutcomeTypes as readonly string[]).includes(type)) throw new LmsAdminDataError("Choose a supported outcome type.", 400);
  const testimonyConsent = bool(body.testimony_use_consent);
  const saved = await supabase.from("alumni_outcome_updates").insert({ alumni_id: alumni.id, outcome_type: type, role_or_activity: text(body.role_or_activity), organisation_or_ministry: text(body.organisation_or_ministry), location_summary: text(body.location_summary), outcome_summary: requiredText(body.outcome_summary, "Provide a brief outcome summary.", 20, 5000), update_date: requiredText(body.update_date, "Record the update date.", 10, 10), may_contact_for_followup: bool(body.may_contact_for_followup), testimony_use_consent: testimonyConsent, testimony_consent_recorded_at: testimonyConsent ? new Date().toISOString() : null, outcome_status: "submitted" }).select("id").single();
  fail(saved.error, "Your alumni outcome update could not be saved.");
  if (!saved.data) throw new LmsAdminDataError("Your alumni outcome update could not be confirmed.");
  await recordLmsAudit(supabase, { action: "alumni_outcome_submitted", entityType: "alumni_outcome_update", entityId: saved.data.id, actorUserId: profileId, metadata: { outcome_type: type, testimony_consent: testimonyConsent } });
  return saved.data;
}

export async function grantAlumniRecordingAccess(supabase: SupabaseClient, alumniId: string, body: Row, actor: GraduationActor) {
  const archiveId = requiredText(body.alumni_course_archive_id, "Choose an archived course.", 1, 80); const recordingId = requiredText(body.class_recording_id, "Choose a recording.", 1, 80);
  const [archive, recording] = await Promise.all([supabase.from("alumni_course_archives").select("id, cohort_course_id, alumni_programme_records!inner(alumni_id)").eq("id", archiveId).maybeSingle(), supabase.from("class_recordings").select("id, class_sessions!inner(cohort_course_id)").eq("id", recordingId).maybeSingle()]);
  fail(archive.error, "Archived course could not be loaded."); fail(recording.error, "Recording could not be loaded.");
  const archiveProgramme = Array.isArray(archive.data?.alumni_programme_records) ? archive.data?.alumni_programme_records[0] : archive.data?.alumni_programme_records; const session = Array.isArray(recording.data?.class_sessions) ? recording.data?.class_sessions[0] : recording.data?.class_sessions;
  if (!archive.data || !recording.data || archiveProgramme?.alumni_id !== alumniId || session?.cohort_course_id !== archive.data.cohort_course_id) throw new LmsAdminDataError("The recording must belong to the selected alumnus's archived course.", 409);
  const saved = await supabase.from("alumni_recording_access_grants").upsert({ alumni_course_archive_id: archiveId, class_recording_id: recordingId, access_status: "active", available_from: timestamp(body.available_from), available_until: timestamp(body.available_until), grant_reason: requiredText(body.grant_reason, "Record the controlled access reason.", 10, 2000), granted_at: new Date().toISOString(), granted_by: actorReference(actor), revoked_at: null, revoked_by: null, revocation_reason: null, updated_at: new Date().toISOString() }, { onConflict: "alumni_course_archive_id,class_recording_id" }).select("*").single(); fail(saved.error, "Alumni recording access could not be granted.");
  await recordLmsAudit(supabase, { action: "alumni_recording_access_granted", entityType: "alumni_recording_access_grant", entityId: saved.data.id, actorUserId: actor.actorUserId, metadata: { alumni_id: alumniId, available_until: saved.data.available_until } }); return saved.data;
}

export async function revokeAlumniRecordingAccess(supabase: SupabaseClient, grantId: string, body: Row, actor: GraduationActor) { const reason = requiredText(body.reason, "Record the access revocation reason.", 10, 2000); const saved = await supabase.from("alumni_recording_access_grants").update({ access_status: "revoked", revoked_at: new Date().toISOString(), revoked_by: actorReference(actor), revocation_reason: reason, updated_at: new Date().toISOString() }).eq("id", grantId).eq("access_status", "active").select("*").maybeSingle(); fail(saved.error, "Recording access could not be revoked."); if (!saved.data) throw new LmsAdminDataError("Active recording grant not found.", 404); await recordLmsAudit(supabase, { action: "alumni_recording_access_revoked", entityType: "alumni_recording_access_grant", entityId: grantId, actorUserId: actor.actorUserId, metadata: { access_status: "revoked" } }); return saved.data; }

export async function createOwnAlumniResourceUrl(supabase: SupabaseClient, resourceId: string, profileId: string) {
  const resource = await supabase.from("session_resources").select("id, external_url, storage_path, is_active, access_level, class_sessions!inner(cohort_course_id)").eq("id", resourceId).maybeSingle(); fail(resource.error, "Archive resource could not be loaded.");
  if (!resource.data || !resource.data.is_active || resource.data.access_level !== "alumni_archive") throw new LmsAdminDataError("This archive resource is not available.", 404);
  const session = Array.isArray(resource.data.class_sessions) ? resource.data.class_sessions[0] : resource.data.class_sessions;
  const ownership = await supabase.from("alumni_course_archives").select("id, alumni_programme_records!inner(alumni!inner(students!inner(profile_id)))").eq("cohort_course_id", session?.cohort_course_id).eq("archive_status", "active"); fail(ownership.error, "Archive ownership could not be checked.");
  const owns = (ownership.data ?? []).some((archive) => { const programme = Array.isArray(archive.alumni_programme_records) ? archive.alumni_programme_records[0] : archive.alumni_programme_records; const alumni = Array.isArray(programme?.alumni) ? programme.alumni[0] : programme?.alumni; const student = Array.isArray(alumni?.students) ? alumni.students[0] : alumni?.students; return student?.profile_id === profileId; });
  if (!owns) throw new LmsAdminDataError("This archive resource does not belong to your alumni account.", 403);
  if (resource.data.external_url) return resource.data.external_url;
  if (!resource.data.storage_path) throw new LmsAdminDataError("This archive resource has no available file.", 404);
  const [first, ...rest] = resource.data.storage_path.split("/"); const bucketList = await supabase.storage.listBuckets(); const bucket = bucketList.data?.some((item) => item.name === first) ? first : "learning-resources"; const objectPath = bucket === first ? rest.join("/") : resource.data.storage_path;
  const signed = await supabase.storage.from(bucket).createSignedUrl(objectPath, 300, { download: true }); if (signed.error || !signed.data?.signedUrl) throw new LmsAdminDataError("A secure archive resource link could not be prepared."); return signed.data.signedUrl;
}
