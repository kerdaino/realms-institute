import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { LmsAdminDataError } from "@/lib/lms/adminData";
import { announcementMatchesProgramme, recordingGrantIsActive } from "@/lib/lms/graduation";

type Row = Record<string, unknown>;
function fail(error: { code?: string } | null, message: string) { if (error) throw new LmsAdminDataError(message); }
function object(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function relation(value: unknown): Row { return Array.isArray(value) ? object(value[0]) : object(value); }

export async function resolveOwnAlumni(supabase: SupabaseClient, profileId: string) {
  const result = await supabase.from("alumni").select("*, students!inner(id, profile_id, student_number, legal_name, preferred_name, email, phone)").eq("students.profile_id", profileId).maybeSingle();
  fail(result.error, "Your alumni account could not be loaded.");
  if (!result.data || result.data.alumni_status !== "active") throw new LmsAdminDataError("Your alumni account is not active.", 403);
  return object(result.data);
}

export async function fetchOwnAlumniProgrammes(supabase: SupabaseClient, alumniId: string) {
  const result = await supabase.from("alumni_programme_records").select("*, cohorts(code, name), student_programme_results(discipleship_points, skill_points, engagement_points, total_points, result_outcome, result_status, published_at), institutional_awards!institutional_awards_alumni_programme_record_id_fkey(id, award_title, award_number, award_status, issued_at, verification_code)").eq("alumni_id", alumniId).eq("programme_record_status", "completed").order("completion_date", { ascending: false });
  fail(result.error, "Completed alumni programmes could not be loaded."); return result.data ?? [];
}

export async function fetchOwnAlumniDashboard(supabase: SupabaseClient, profileId: string) {
  const alumni = await resolveOwnAlumni(supabase, profileId); const programmes = await fetchOwnAlumniProgrammes(supabase, String(alumni.id)); const announcements = await fetchOwnAlumniAnnouncements(supabase, String(alumni.id), programmes);
  return { alumni, student: relation(alumni.students), programmes, announcements: announcements.slice(0, 4) };
}

export async function fetchOwnAlumniArchive(supabase: SupabaseClient, alumniId: string) {
  const alumni = await supabase.from("alumni").select("learning_archive_access, alumni_status").eq("id", alumniId).maybeSingle(); fail(alumni.error, "Archive access could not be checked.");
  if (!alumni.data || alumni.data.alumni_status !== "active" || !alumni.data.learning_archive_access) throw new LmsAdminDataError("Learning archive access is not currently enabled.", 403);
  const courses = await supabase.from("alumni_course_archives").select("*, alumni_programme_records!inner(id, alumni_id, programme_name, cohort_name_snapshot, discipleship_route, skill_pathway), alumni_summary_archive_items(*)").eq("alumni_programme_records.alumni_id", alumniId).eq("archive_status", "active").order("archived_at");
  fail(courses.error, "Learning archive could not be loaded.");
  const courseRows = courses.data ?? []; const offeringIds = courseRows.map((course) => course.cohort_course_id);
  const [sessions, resources] = offeringIds.length ? await Promise.all([supabase.from("class_sessions").select("id, cohort_course_id, title, scheduled_start_at").in("cohort_course_id", offeringIds), supabase.rpc("get_own_alumni_archive_resources")]) : [{ data: [], error: null }, { data: [], error: null }];
  fail(sessions.error, "Alumni archive sessions could not be loaded."); fail(resources.error, "Alumni archive resources could not be loaded.");
  const resourcesBySession = new Map<string, Row[]>(); for (const resource of resources.data ?? []) resourcesBySession.set(resource.class_session_id, [...(resourcesBySession.get(resource.class_session_id) ?? []), resource]);
  const safeSessions = (sessions.data ?? []).map((session) => ({ ...session, session_resources: resourcesBySession.get(session.id) ?? [] }));
  const grants = courseRows.length ? await supabase.from("alumni_recording_access_grants").select("id, alumni_course_archive_id, class_recording_id, access_status, available_from, available_until, granted_at, class_recordings(id, title, external_url, embed_url, recording_status, retention_status, available_from, available_until)").in("alumni_course_archive_id", courseRows.map((course) => course.id)).eq("access_status", "active") : { data: [], error: null };
  fail(grants.error, "Alumni recording access could not be loaded.");
  const optionalText = (value: unknown) => typeof value === "string" ? value : null;
  const visibleRecordings = (grants.data ?? []).filter((grant) => { const recording = relation(grant.class_recordings); return recordingGrantIsActive({ accessStatus: String(grant.access_status), grantAvailableFrom: optionalText(grant.available_from), grantAvailableUntil: optionalText(grant.available_until), recordingStatus: String(recording.recording_status), retentionStatus: String(recording.retention_status), recordingAvailableFrom: optionalText(recording.available_from), recordingAvailableUntil: optionalText(recording.available_until) }); });
  return { courses: courseRows.map((course) => ({ ...course, alumni_summary_archive_items: (course.alumni_summary_archive_items ?? []).filter((item: Row) => item.archive_status === "active") })), sessions: safeSessions, recordings: visibleRecordings };
}

export async function fetchOwnAlumniAnnouncements(supabase: SupabaseClient, alumniId: string, programmeRows?: Row[]) {
  const programmes = programmeRows ?? await fetchOwnAlumniProgrammes(supabase, alumniId);
  const current = new Date().toISOString();
  const announcements = await supabase.from("alumni_announcements").select("*, alumni_announcement_reads(id, read_at)").eq("announcement_status", "published").lte("published_at", current).or(`expires_at.is.null,expires_at.gt.${current}`).order("published_at", { ascending: false });
  fail(announcements.error, "Alumni announcements could not be loaded.");
  return (announcements.data ?? []).filter((announcement) => programmes.some((programme) => announcementMatchesProgramme({ targetScope: String(announcement.target_scope), targetValue: announcement.target_value, cohortId: String(programme.cohort_id), cohortName: String(programme.cohort_name_snapshot ?? ""), discipleshipRoute: String(programme.discipleship_route), skillPathway: String(programme.skill_pathway) })));
}

export async function fetchOwnAlumniOutcomes(supabase: SupabaseClient, alumniId: string) { const result = await supabase.from("alumni_outcome_updates").select("id, alumni_id, outcome_type, role_or_activity, organisation_or_ministry, location_summary, outcome_summary, update_date, may_contact_for_followup, testimony_use_consent, testimony_consent_recorded_at, outcome_status, created_at, updated_at").eq("alumni_id", alumniId).order("created_at", { ascending: false }); fail(result.error, "Alumni outcome updates could not be loaded."); return result.data ?? []; }
