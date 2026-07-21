import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ClassSession } from "@/lib/lms/types";
import { LmsAdminDataError } from "@/lib/lms/adminData";

function fail(label: string, error: { message: string } | null) {
  if (error) throw new LmsAdminDataError(`${label} could not be loaded.`);
}

export type SessionFilters = {
  search?: string;
  cohort?: string;
  course?: string;
  category?: string;
  route?: string;
  pathway?: string;
  facilitator?: string;
  deliveryMode?: string;
  status?: string;
  from?: string;
  to?: string;
};

export async function fetchSessionOptions(supabase: SupabaseClient) {
  const [offerings, facilitators] = await Promise.all([
    supabase.from("cohort_courses").select("id, delivery_mode, schedule_text, status, cohorts(id, code, name, status), courses(id, code, title, course_category, discipleship_route, skill_pathway), facilitator_course_assignments(assignment_role, facilitators(id, display_name, title, facilitator_status))").order("created_at"),
    supabase.from("facilitators").select("id, display_name, title, facilitator_status").eq("facilitator_status", "active").order("display_name"),
  ]);
  fail("Cohort course options", offerings.error);
  fail("Facilitator options", facilitators.error);
  return { offerings: offerings.data ?? [], facilitators: facilitators.data ?? [] };
}

export async function fetchAdminSessions(supabase: SupabaseClient, filters: SessionFilters = {}) {
  const result = await supabase.from("class_sessions").select("*, cohort_courses(id, delivery_mode, schedule_text, cohorts(id, code, name), courses(id, code, title, course_category, discipleship_route, skill_pathway)), facilitators(id, display_name, title), class_summaries(id, summary_status, version_number, updated_at), class_recordings(id, recording_status, quality_checked)").limit(5000);
  fail("Class sessions", result.error);
  const search = filters.search?.trim().toLowerCase();
  const from = filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from) ? Date.parse(`${filters.from}T00:00:00Z`) : null;
  const to = filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to) ? Date.parse(`${filters.to}T23:59:59Z`) : null;
  const sessions = (result.data ?? []).filter((raw) => {
    const row = raw as Record<string, unknown>;
    const offering = object(row.cohort_courses); const course = object(offering.courses); const cohort = object(offering.cohorts);
    const scheduled = typeof row.scheduled_start_at === "string" ? Date.parse(row.scheduled_start_at) : null;
    if (search && ![row.title, course.code, course.title].some((value) => typeof value === "string" && value.toLowerCase().includes(search))) return false;
    if (filters.cohort && cohort.id !== filters.cohort) return false;
    if (filters.course && course.id !== filters.course) return false;
    if (filters.category && course.course_category !== filters.category) return false;
    if (filters.route && course.discipleship_route !== filters.route) return false;
    if (filters.pathway && course.skill_pathway !== filters.pathway) return false;
    if (filters.facilitator && row.facilitator_id !== filters.facilitator) return false;
    if (filters.deliveryMode && row.delivery_mode !== filters.deliveryMode) return false;
    if (filters.status && row.session_status !== filters.status) return false;
    if (from !== null && (scheduled === null || scheduled < from)) return false;
    if (to !== null && (scheduled === null || scheduled > to)) return false;
    return true;
  });
  const now = Date.now();
  sessions.sort((a, b) => {
    const aTime = typeof a.scheduled_start_at === "string" ? Date.parse(a.scheduled_start_at) : null;
    const bTime = typeof b.scheduled_start_at === "string" ? Date.parse(b.scheduled_start_at) : null;
    const aGroup = aTime === null ? 1 : aTime >= now ? 0 : 2;
    const bGroup = bTime === null ? 1 : bTime >= now ? 0 : 2;
    if (aGroup !== bGroup) return aGroup - bGroup;
    if (aTime === null || bTime === null) return String(a.title).localeCompare(String(b.title));
    return aGroup === 2 ? bTime - aTime : aTime - bTime;
  });
  return sessions.map((session) => ({ ...session, is_past: Boolean(session.scheduled_start_at && Date.parse(String(session.scheduled_start_at)) < now) }));
}

export async function fetchAdminSession(supabase: SupabaseClient, id: string) {
  const [session, summary, resources, recordings, changes, audits, recordingRequirements, assignmentCount] = await Promise.all([
    supabase.from("class_sessions").select("*, cohort_courses(*, cohorts(id, code, name, status), courses(*), facilitator_course_assignments(assignment_role, facilitators(id, display_name, title, facilitator_status))), facilitators(id, display_name, title, facilitator_status)").eq("id", id).maybeSingle(),
    supabase.from("class_summaries").select("*").eq("class_session_id", id).maybeSingle(),
    supabase.from("session_resources").select("*").eq("class_session_id", id).order("sort_order").order("created_at"),
    supabase.from("class_recordings").select("*").eq("class_session_id", id).order("created_at"),
    supabase.from("session_change_events").select("*").eq("class_session_id", id).order("created_at", { ascending: false }),
    supabase.from("audit_logs").select("*").eq("entity_type", "class_session").eq("entity_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("session_recording_requirements").select("*").eq("class_session_id", id).eq("requirement_status", "active").maybeSingle(),
    supabase.from("recording_learning_assignments").select("id", { count: "exact", head: true }).eq("class_session_id", id),
  ]);
  for (const [label, result] of [["Class session", session], ["Class summary", summary], ["Session resources", resources], ["Class recordings", recordings], ["Session change history", changes], ["Session audit history", audits], ["Recorded-learning requirements", recordingRequirements], ["Recorded-learning assignment count", assignmentCount]] as const) fail(label, result.error);
  if (!session.data) throw new LmsAdminDataError("Class session not found.", 404);
  const offering = relation(session.data.cohort_courses);
  const [recordingPolicy, assessmentAssignments, assessmentQuizzes] = await Promise.all([
    supabase.from("recording_completion_policies").select("*").eq("cohort_id", String(offering.cohort_id)).eq("policy_status", "active").maybeSingle(),
    supabase.from("assignments").select("id, title, assignment_type, assignment_status").eq("cohort_course_id", String(session.data.cohort_course_id)).in("assignment_status", ["draft", "published"]),
    supabase.from("quizzes").select("id, title, quiz_status").eq("cohort_course_id", String(session.data.cohort_course_id)).in("quiz_status", ["draft", "published"]),
  ]);
  fail("Recorded-learning policy", recordingPolicy.error);
  fail("Session assignment links", assessmentAssignments.error);
  fail("Session quiz links", assessmentQuizzes.error);
  let versions: unknown[] = [];
  if (summary.data) {
    const result = await supabase.from("class_summary_versions").select("id, version_number, change_note, created_by, created_at").eq("class_summary_id", summary.data.id).order("version_number", { ascending: false });
    fail("Class summary history", result.error); versions = result.data ?? [];
  }
  return { session: session.data, summary: summary.data, summaryVersions: versions, resources: resources.data ?? [], recordings: recordings.data ?? [], changes: changes.data ?? [], audits: audits.data ?? [], recordingRequirements: recordingRequirements.data, recordingPolicy: recordingPolicy.data, recordingAssignmentCount: assignmentCount.count ?? 0, assessmentAssignments: assessmentAssignments.data ?? [], assessmentQuizzes: assessmentQuizzes.data ?? [] };
}

export async function fetchCohortSessions(supabase: SupabaseClient, cohortId: string) {
  const result = await supabase.from("class_sessions").select("id, cohort_course_id, title, session_number, session_type, delivery_mode, scheduled_start_at, scheduled_end_at, timezone, session_status, facilitator_id, facilitators(id, display_name), cohort_courses!inner(cohort_id, courses(id, code, title))").eq("cohort_courses.cohort_id", cohortId).order("scheduled_start_at", { ascending: true, nullsFirst: false });
  fail("Cohort sessions", result.error); return result.data ?? [];
}

export async function fetchCourseSessions(supabase: SupabaseClient, courseId: string) {
  const result = await supabase.from("class_sessions").select("id, cohort_course_id, title, session_number, session_type, delivery_mode, scheduled_start_at, scheduled_end_at, timezone, session_status, facilitator_id, facilitators(id, display_name), cohort_courses!inner(course_id, cohorts(id, code, name))").eq("cohort_courses.course_id", courseId).order("scheduled_start_at", { ascending: true, nullsFirst: false });
  fail("Course sessions", result.error); return result.data ?? [];
}

export function object(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function relation(value: unknown) { return Array.isArray(value) ? object(value[0]) : object(value); }
export function text(value: unknown) { return typeof value === "string" ? value : null; }
export function summaryRelation(value: unknown) { return Array.isArray(value) ? object(value[0]) : object(value); }
export function isPastSession(session: Pick<ClassSession, "scheduled_start_at">) { return Boolean(session.scheduled_start_at && Date.parse(session.scheduled_start_at) < Date.now()); }
