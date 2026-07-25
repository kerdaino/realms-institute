import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "@/lib/lms/adminConstants";
import { requireRole } from "@/lib/lms/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { selectCurrentStudentEnrollment } from "@/lib/lms/currentEnrollment";

const activeEnrollmentStatuses = ["active", "enrolled"];

export class StudentLearningDataError extends Error {
  constructor(message = "We could not load this learning area right now. Please refresh the page or contact REALMS Institute if the issue continues.") {
    super(message);
    this.name = "StudentLearningDataError";
  }
}

type StudentLearningContext = {
  supabase: SupabaseClient;
  studentId: string;
  studentEnrollmentId: string;
  discipleshipRoute: string;
  skillPathway: string;
};

export type LearningCourse = {
  courseEnrollmentId: string;
  offeringId: string;
  courseId: string;
  code: string;
  title: string;
  category: string;
  categoryLabel: string;
  componentLabel: string;
  discipleshipRoute: string | null;
  skillPathway: string | null;
  sequenceNumber: number | null;
  description: string | null;
  purpose: string | null;
  learningOutcomes: string[];
  deliveryWeek: string | null;
  deliveryMode: string | null;
  deliveryRoute: string | null;
  schedule: string | null;
  cohortCode: string;
  cohortName: string;
  facilitators: string[];
  sessionCount: number;
  summaryCount: number;
  recordingCount: number;
  isCapstone: boolean;
};

export type LearningSession = {
  id: string;
  title: string;
  description: string | null;
  sessionNumber: number | null;
  sessionType: string;
  deliveryMode: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  timezone: string;
  status: string;
  facilitator: string | null;
  hasSummary: boolean;
  hasResources: boolean;
  hasRecording: boolean;
  isPast: boolean;
};

export type LearningSummaryArchiveItem = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  sessionDate: string | null;
  title: string;
  versionNumber: number;
  updatedAt: string;
};

export type LearningResource = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  title: string;
  description: string | null;
  resourceType: string;
  externalUrl: string | null;
  hasControlledFile: boolean;
  fileName: string | null;
};

export type LearningRecording = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  sessionDate: string | null;
  title: string;
  provider: string | null;
  durationSeconds: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  availability: "available" | "upcoming" | "expired";
  safeEmbedUrl: string | null;
  canWatch: boolean;
};

export type LearningSummary = {
  id: string;
  title: string;
  versionNumber: number;
  updatedAt: string;
  learningObjectives: string[];
  keyTeachingPoints: string[];
  keyScriptures: string[];
  importantConcepts: string[];
  practicalApplications: string[];
  actionPoints: string[];
  recommendedResources: string[];
  additionalNotes: string | null;
};

export type StudentCourseDetail = {
  course: LearningCourse;
  upcomingSessions: LearningSession[];
  pastSessions: LearningSession[];
  summaryArchive: LearningSummaryArchiveItem[];
  resources: LearningResource[];
  recordings: LearningRecording[];
};

export type LiveClassAccess = {
  state: "not_applicable" | "missing" | "not_scheduled" | "too_early" | "available" | "ended" | "unavailable";
  message: string | null;
  href: string | null;
};

export type StudentSessionDetail = {
  course: LearningCourse;
  session: LearningSession & { physicalLocation: string | null };
  summary: LearningSummary | null;
  resources: LearningResource[];
  recordings: LearningRecording[];
  previousSession: Pick<LearningSession, "id" | "title"> | null;
  nextSession: Pick<LearningSession, "id" | "title"> | null;
  liveAccess: LiveClassAccess;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function relation(value: unknown) {
  return Array.isArray(value) ? object(value[0]) : object(value);
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeHttpUrl(value: unknown) {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:") ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeRecordingEmbed(value: unknown) {
  const candidate = safeHttpUrl(value);
  if (!candidate) return null;
  const url = new URL(candidate);
  const host = url.hostname.toLowerCase();
  const approved = host === "www.youtube.com" || host === "youtube.com" || host === "www.youtube-nocookie.com" || host === "player.vimeo.com";
  return approved ? candidate : null;
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [item.trim()];
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const parts = Object.entries(item).flatMap(([key, entry]) => typeof entry === "string" && entry.trim() ? [`${key.replaceAll("_", " ")}: ${entry.trim()}`] : []);
    return parts.length ? [parts.join(" · ")] : [];
  });
}

function fail(label: string, error: { code?: string; message?: string } | null) {
  if (!error) return;
  console.error(`Student learning ${label} failed`, { code: error.code, message: error.message });
  throw new StudentLearningDataError();
}

function programmeComponent(course: { code: string; discipleshipRoute: string | null; skillPathway: string | null }) {
  if (course.code.endsWith(" 190")) return course.skillPathway === "cybersecurity_foundations" ? "Cybersecurity Foundations" : "Web Development";
  if (course.discipleshipRoute === "advanced") return "Advanced Discipleship";
  if (course.discipleshipRoute === "foundational") return "Foundational Discipleship";
  if (course.skillPathway === "cybersecurity_foundations") return "Cybersecurity Foundations";
  return "Web Development";
}

function courseCategoryLabel(code: string, category: string) {
  return code.endsWith(" 190") ? "Integrated Capstone" : category === "discipleship" ? "Discipleship" : category === "skill" ? "Skill Pathway" : category.replaceAll("_", " ");
}

function validCourseForEnrollment(course: LearningCourse, context: StudentLearningContext) {
  if (course.category === "discipleship") return course.discipleshipRoute === context.discipleshipRoute;
  if (course.category === "skill") return course.skillPathway === context.skillPathway;
  return false;
}

function sessionSort(a: LearningSession, b: LearningSession) {
  if (a.scheduledStartAt && b.scheduledStartAt) return Date.parse(a.scheduledStartAt) - Date.parse(b.scheduledStartAt);
  if (a.scheduledStartAt) return -1;
  if (b.scheduledStartAt) return 1;
  return (a.sessionNumber ?? Number.MAX_SAFE_INTEGER) - (b.sessionNumber ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title);
}

function recordingAvailability(row: Record<string, unknown>, now: Date) {
  const from = text(row.available_from);
  const until = text(row.available_until);
  if (from && Date.parse(from) > now.valueOf()) return "upcoming" as const;
  if (until && Date.parse(until) < now.valueOf()) return "expired" as const;
  return "available" as const;
}

function assignmentNames(rows: readonly Record<string, unknown>[]) {
  return [...new Set(rows.flatMap((row) => {
    const facilitator = relation(row.facilitators);
    const name = text(row.display_name) ?? text(facilitator.display_name);
    return name ? [name] : [];
  }))];
}

async function loadStudentFacilitatorPresentations(supabase: SupabaseClient, offeringIds: string[]) {
  if (!offeringIds.length) return [] as Record<string, unknown>[];
  const result = await supabase.rpc("get_student_course_facilitators", { target_offering_ids: offeringIds });
  if (result.error?.code === "PGRST202" || result.error?.code === "42883") {
    console.warn("Facilitator presentation data is unavailable.");
    return [] as Record<string, unknown>[];
  }
  fail("course facilitator presentation lookup", result.error);
  return (result.data ?? []).map(object);
}

const resolveStudentLearningContext = cache(async (): Promise<StudentLearningContext> => {
  const { user } = await requireRole("student");
  const supabase = await createSupabaseServerClient();
  const studentResult = await supabase.from("students").select("id").eq("profile_id", user.id).maybeSingle();
  fail("student access lookup", studentResult.error);
  if (!studentResult.data) throw new StudentLearningDataError("Your student account has not yet been fully activated. Please contact REALMS Institute.");
  const enrollmentResult = await selectCurrentStudentEnrollment<{ id: string; discipleship_route: string; skill_pathway: string }>(supabase, studentResult.data.id, "id, discipleship_route, skill_pathway");
  fail("current enrollment lookup", enrollmentResult.error);
  if (!enrollmentResult.data) throw new StudentLearningDataError("Your course enrolment is still being prepared. Please contact REALMS Institute if this persists.");
  return { supabase, studentId: studentResult.data.id, studentEnrollmentId: enrollmentResult.data.id, discipleshipRoute: enrollmentResult.data.discipleship_route, skillPathway: enrollmentResult.data.skill_pathway };
});

function mapCourseEnrollment(raw: Record<string, unknown>, facilitatorRows: readonly Record<string, unknown>[] = []): LearningCourse | null {
  const offering = relation(raw.cohort_courses);
  const course = relation(offering.courses);
  const cohort = relation(offering.cohorts);
  const courseEnrollmentId = text(raw.id);
  const offeringId = text(offering.id);
  const courseId = text(course.id);
  const code = text(course.code);
  const title = text(course.title);
  const category = text(course.course_category);
  const cohortCode = text(cohort.code);
  const cohortName = text(cohort.name);
  if (!courseEnrollmentId || !offeringId || !courseId || !code || !title || !category || !cohortCode || !cohortName) return null;
  const discipleshipRoute = text(course.discipleship_route);
  const skillPathway = text(course.skill_pathway);
  return {
    courseEnrollmentId,
    offeringId,
    courseId,
    code,
    title,
    category,
    categoryLabel: courseCategoryLabel(code, category),
    componentLabel: programmeComponent({ code, discipleshipRoute, skillPathway }),
    discipleshipRoute,
    skillPathway,
    sequenceNumber: numeric(course.sequence_number),
    description: text(course.description),
    purpose: text(course.course_purpose),
    learningOutcomes: list(course.learning_outcomes),
    deliveryWeek: text(course.delivery_week),
    deliveryMode: text(offering.delivery_mode),
    deliveryRoute: text(raw.delivery_route),
    schedule: text(offering.schedule_text) ?? text(course.default_schedule_text),
    cohortCode,
    cohortName,
    facilitators: assignmentNames(facilitatorRows.filter((row) => text(row.cohort_course_id) === offeringId)),
    sessionCount: 0,
    summaryCount: 0,
    recordingCount: 0,
    isCapstone: code === "RSD-WEB 190" || code === "RSD-CYB 190",
  };
}

function approvedSessionDelivery(configured: string | null, route: string | null) {
  if (route === "RP" || route === "DR-E") return "recorded_primary";
  if (configured !== "hybrid") return configured ?? "not_available";
  if (route === "PL") return "physical";
  if (route === "OL") return "online";
  return configured;
}

function mapSession(raw: Record<string, unknown>, content: { summarySessionIds: Set<string>; resourceSessionIds: Set<string>; recordingSessionIds: Set<string> }, fallbackFacilitator: string | null, now: Date, deliveryRoute: string | null = null): LearningSession | null {
  const id = text(raw.id);
  const title = text(raw.title);
  if (!id || !title) return null;
  const facilitator = relation(raw.facilitators);
  const scheduledStartAt = text(raw.scheduled_start_at);
  return {
    id,
    title,
    description: text(raw.description),
    sessionNumber: numeric(raw.session_number),
    sessionType: text(raw.session_type) ?? "teaching",
    deliveryMode: approvedSessionDelivery(text(raw.delivery_mode), deliveryRoute),
    scheduledStartAt,
    scheduledEndAt: text(raw.scheduled_end_at),
    timezone: text(raw.timezone) ?? "Africa/Lagos",
    status: text(raw.session_status) ?? "scheduled",
    facilitator: text(facilitator.display_name) ?? fallbackFacilitator,
    hasSummary: content.summarySessionIds.has(id),
    hasResources: content.resourceSessionIds.has(id),
    hasRecording: content.recordingSessionIds.has(id),
    isPast: Boolean(scheduledStartAt && Date.parse(scheduledStartAt) < now.valueOf()),
  };
}

async function loadOfferingContent(supabase: SupabaseClient, offeringIds: string[]) {
  if (!offeringIds.length) return { sessions: [] as Record<string, unknown>[], summaries: [] as Record<string, unknown>[], resources: [] as Record<string, unknown>[], recordings: [] as Record<string, unknown>[], assignments: [] as Record<string, unknown>[] };
  const sessionResult = await supabase.from("class_sessions").select("id, cohort_course_id, title, description, session_number, session_type, delivery_mode, scheduled_start_at, scheduled_end_at, timezone, session_status, visibility_status, facilitator_id, facilitators(id, display_name, title)").in("cohort_course_id", offeringIds).eq("visibility_status", "enrolled_only");
  fail("course sessions lookup", sessionResult.error);
  const sessionIds = (sessionResult.data ?? []).map((row) => row.id);
  const [summaryResult, resourceResult, recordingResult, assignments] = await Promise.all([
    sessionIds.length ? supabase.from("class_summaries").select("id, class_session_id, title, version_number, published_at, updated_at, summary_status").in("class_session_id", sessionIds).eq("summary_status", "published") : Promise.resolve({ data: [], error: null }),
    sessionIds.length ? supabase.from("session_resources").select("id, class_session_id, title, description, resource_type, external_url, storage_path, file_name, access_level, is_active").in("class_session_id", sessionIds).eq("is_active", true).eq("access_level", "enrolled_students") : Promise.resolve({ data: [], error: null }),
    sessionIds.length ? supabase.from("class_recordings").select("id, class_session_id, title, provider, duration_seconds, recording_status, access_level, available_from, available_until, created_at").in("class_session_id", sessionIds).eq("recording_status", "available").eq("access_level", "enrolled_students") : Promise.resolve({ data: [], error: null }),
    loadStudentFacilitatorPresentations(supabase, offeringIds),
  ]);
  fail("published summary lookup", summaryResult.error);
  fail("permitted resource lookup", resourceResult.error);
  fail("available recording lookup", recordingResult.error);
  return { sessions: (sessionResult.data ?? []).map(object), summaries: (summaryResult.data ?? []).map(object), resources: (resourceResult.data ?? []).map(object), recordings: (recordingResult.data ?? []).map(object), assignments };
}

export const getStudentCourses = cache(async (): Promise<LearningCourse[]> => {
  const context = await resolveStudentLearningContext();
  const result = await context.supabase.from("course_enrollments").select("id, cohort_course_id, enrollment_status, delivery_route, cohort_courses(id, delivery_mode, schedule_text, courses(id, code, title, course_category, discipleship_route, skill_pathway, sequence_number, description, course_purpose, delivery_week, default_schedule_text, learning_outcomes), cohorts(id, code, name))").eq("student_enrollment_id", context.studentEnrollmentId).in("enrollment_status", activeEnrollmentStatuses);
  fail("enrolled course lookup", result.error);
  const preliminary = (result.data ?? []).map((row) => mapCourseEnrollment(object(row))).filter((course): course is LearningCourse => Boolean(course));
  const content = await loadOfferingContent(context.supabase, preliminary.map((course) => course.offeringId));
  const sessionsByOffering = new Map<string, string[]>();
  for (const row of content.sessions) {
    const offeringId = text(row.cohort_course_id); const id = text(row.id);
    if (offeringId && id) sessionsByOffering.set(offeringId, [...(sessionsByOffering.get(offeringId) ?? []), id]);
  }
  const summaryIds = new Set(content.summaries.map((row) => text(row.class_session_id)).filter(Boolean));
  const now = new Date();
  const recordingIds = new Set(content.recordings.filter((row) => recordingAvailability(row, now) === "available").map((row) => text(row.class_session_id)).filter(Boolean));
  return (result.data ?? []).map((row) => mapCourseEnrollment(object(row), content.assignments)).filter((course): course is LearningCourse => Boolean(course)).filter((course) => validCourseForEnrollment(course, context)).map((course) => {
    const sessionIds = sessionsByOffering.get(course.offeringId) ?? [];
    return { ...course, sessionCount: sessionIds.length, summaryCount: sessionIds.filter((id) => summaryIds.has(id)).length, recordingCount: sessionIds.filter((id) => recordingIds.has(id)).length };
  }).sort((a, b) => (a.sequenceNumber ?? Number.MAX_SAFE_INTEGER) - (b.sequenceNumber ?? Number.MAX_SAFE_INTEGER) || a.code.localeCompare(b.code, undefined, { numeric: true }));
});

async function loadStudentCourseDetail(courseEnrollmentId: string): Promise<StudentCourseDetail | null> {
  if (!isUuid(courseEnrollmentId)) return null;
  const context = await resolveStudentLearningContext();
  const result = await context.supabase.from("course_enrollments").select("id, cohort_course_id, enrollment_status, delivery_route, cohort_courses(id, delivery_mode, schedule_text, courses(id, code, title, course_category, discipleship_route, skill_pathway, sequence_number, description, course_purpose, delivery_week, default_schedule_text, learning_outcomes), cohorts(id, code, name))").eq("id", courseEnrollmentId).eq("student_enrollment_id", context.studentEnrollmentId).in("enrollment_status", activeEnrollmentStatuses).maybeSingle();
  fail("course access lookup", result.error);
  if (!result.data) return null;
  const initial = mapCourseEnrollment(object(result.data));
  if (!initial || !validCourseForEnrollment(initial, context)) return null;
  const content = await loadOfferingContent(context.supabase, [initial.offeringId]);
  const course = mapCourseEnrollment(object(result.data), content.assignments);
  if (!course) return null;
  const summarySessionIds = new Set(content.summaries.map((row) => text(row.class_session_id)).filter(Boolean) as string[]);
  const resourceSessionIds = new Set(content.resources.map((row) => text(row.class_session_id)).filter(Boolean) as string[]);
  const now = new Date();
  const currentRecordings = content.recordings.filter((row) => recordingAvailability(row, now) === "available");
  const recordingSessionIds = new Set(currentRecordings.map((row) => text(row.class_session_id)).filter(Boolean) as string[]);
  const fallbackFacilitator = course.facilitators[0] ?? null;
  const sessions = content.sessions.map((row) => mapSession(row, { summarySessionIds, resourceSessionIds, recordingSessionIds }, fallbackFacilitator, now, course.deliveryRoute)).filter((session): session is LearningSession => Boolean(session)).sort(sessionSort);
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  course.sessionCount = sessions.length;
  course.summaryCount = content.summaries.length;
  course.recordingCount = currentRecordings.length;
  const summaryArchive = content.summaries.flatMap((row) => {
    const session = sessionById.get(text(row.class_session_id) ?? ""); const id = text(row.id); const updatedAt = text(row.updated_at) ?? text(row.published_at);
    if (!session || !id || !updatedAt) return [];
    return [{ id, sessionId: session.id, sessionTitle: session.title, sessionDate: session.scheduledStartAt, title: text(row.title) ?? session.title, versionNumber: numeric(row.version_number) ?? 1, updatedAt } satisfies LearningSummaryArchiveItem];
  }).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const resources = content.resources.flatMap((row) => {
    const session = sessionById.get(text(row.class_session_id) ?? ""); const id = text(row.id); const title = text(row.title);
    if (!session || !id || !title) return [];
    return [{ id, sessionId: session.id, sessionTitle: session.title, title, description: text(row.description), resourceType: text(row.resource_type) ?? "other", externalUrl: safeHttpUrl(row.external_url), hasControlledFile: Boolean(text(row.storage_path)), fileName: text(row.file_name) } satisfies LearningResource];
  });
  const recordings = currentRecordings.flatMap((row) => mapRecording(row, sessionById, now, false));
  return { course, upcomingSessions: sessions.filter((session) => !session.isPast && session.status !== "completed"), pastSessions: sessions.filter((session) => session.isPast || session.status === "completed"), summaryArchive, resources, recordings };
}

export const getStudentCourseDetail = cache(loadStudentCourseDetail);

function mapSummary(row: Record<string, unknown>, sessionTitle: string): LearningSummary {
  return {
    id: text(row.id) ?? "published-summary",
    title: text(row.title) ?? sessionTitle,
    versionNumber: numeric(row.version_number) ?? 1,
    updatedAt: text(row.updated_at) ?? text(row.published_at) ?? new Date(0).toISOString(),
    learningObjectives: list(row.learning_objectives),
    keyTeachingPoints: list(row.key_teaching_points),
    keyScriptures: list(row.key_scriptures_references),
    importantConcepts: list(row.important_concepts),
    practicalApplications: list(row.practical_applications),
    actionPoints: list(row.action_points),
    recommendedResources: list(row.recommended_resources),
    additionalNotes: text(row.additional_notes),
  };
}

function mapRecording(row: Record<string, unknown>, sessionById: Map<string, LearningSession>, now: Date, includeAccess: boolean): LearningRecording[] {
  const session = sessionById.get(text(row.class_session_id) ?? ""); const id = text(row.id); const title = text(row.title);
  if (!session || !id || !title) return [];
  const availability = recordingAvailability(row, now);
  const external = safeHttpUrl(row.external_url);
  const embed = availability === "available" && includeAccess ? safeRecordingEmbed(row.embed_url) : null;
  return [{ id, sessionId: session.id, sessionTitle: session.title, sessionDate: session.scheduledStartAt, title, provider: text(row.provider), durationSeconds: numeric(row.duration_seconds), availableFrom: text(row.available_from), availableUntil: text(row.available_until), availability, safeEmbedUrl: embed, canWatch: availability === "available" && Boolean(external || safeHttpUrl(row.embed_url)) }];
}

async function loadStudentSessionDetail(sessionId: string): Promise<StudentSessionDetail | null> {
  if (!isUuid(sessionId)) return null;
  const context = await resolveStudentLearningContext();
  const sessionResult = await context.supabase.from("class_sessions").select("id, cohort_course_id, title, description, session_number, session_type, delivery_mode, scheduled_start_at, scheduled_end_at, timezone, live_join_url, physical_location, session_status, visibility_status, facilitator_id, facilitators(id, display_name, title)").eq("id", sessionId).eq("visibility_status", "enrolled_only").maybeSingle();
  fail("session access lookup", sessionResult.error);
  if (!sessionResult.data) return null;
  const offeringId = sessionResult.data.cohort_course_id;
  const courseEnrollmentResult = await context.supabase.from("course_enrollments").select("id, cohort_course_id, enrollment_status, delivery_route, cohort_courses(id, delivery_mode, schedule_text, courses(id, code, title, course_category, discipleship_route, skill_pathway, sequence_number, description, course_purpose, delivery_week, default_schedule_text, learning_outcomes), cohorts(id, code, name))").eq("student_enrollment_id", context.studentEnrollmentId).eq("cohort_course_id", offeringId).in("enrollment_status", activeEnrollmentStatuses).maybeSingle();
  fail("session course enrollment lookup", courseEnrollmentResult.error);
  if (!courseEnrollmentResult.data) return null;
  const [summaryResult, resourceResult, recordingResult, siblingResult, assignments] = await Promise.all([
    context.supabase.from("class_summaries").select("id, class_session_id, title, learning_objectives, key_teaching_points, key_scriptures_references, important_concepts, practical_applications, action_points, recommended_resources, additional_notes, summary_status, version_number, published_at, updated_at").eq("class_session_id", sessionId).eq("summary_status", "published").maybeSingle(),
    context.supabase.from("session_resources").select("id, class_session_id, title, description, resource_type, external_url, storage_path, file_name, access_level, is_active, sort_order").eq("class_session_id", sessionId).eq("is_active", true).eq("access_level", "enrolled_students").order("sort_order"),
    context.supabase.from("class_recordings").select("id, class_session_id, title, provider, external_url, embed_url, duration_seconds, recording_status, access_level, available_from, available_until, created_at").eq("class_session_id", sessionId).eq("recording_status", "available").eq("access_level", "enrolled_students").order("created_at"),
    context.supabase.from("class_sessions").select("id, title, description, session_number, session_type, delivery_mode, scheduled_start_at, scheduled_end_at, timezone, session_status, facilitator_id, facilitators(id, display_name, title)").eq("cohort_course_id", offeringId).eq("visibility_status", "enrolled_only"),
    loadStudentFacilitatorPresentations(context.supabase, [offeringId]),
  ]);
  fail("published session summary lookup", summaryResult.error);
  fail("session resource lookup", resourceResult.error);
  fail("session recording lookup", recordingResult.error);
  fail("adjacent session lookup", siblingResult.error);
  const course = mapCourseEnrollment(object(courseEnrollmentResult.data), assignments);
  if (!course || !validCourseForEnrollment(course, context)) return null;
  const now = new Date();
  const emptyContent = { summarySessionIds: new Set<string>(), resourceSessionIds: new Set<string>(), recordingSessionIds: new Set<string>() };
  const siblings = (siblingResult.data ?? []).map((row) => mapSession(object(row), emptyContent, course.facilitators[0] ?? null, now, course.deliveryRoute)).filter((session): session is LearningSession => Boolean(session)).sort(sessionSort);
  const currentIndex = siblings.findIndex((session) => session.id === sessionId);
  const baseSession = siblings[currentIndex] ?? mapSession(object(sessionResult.data), emptyContent, course.facilitators[0] ?? null, now, course.deliveryRoute);
  if (!baseSession) return null;
  const sessionById = new Map([[baseSession.id, baseSession]]);
  const resources = (resourceResult.data ?? []).flatMap((raw) => {
    const row = object(raw); const id = text(row.id); const title = text(row.title);
    if (!id || !title) return [];
    return [{ id, sessionId, sessionTitle: baseSession.title, title, description: text(row.description), resourceType: text(row.resource_type) ?? "other", externalUrl: safeHttpUrl(row.external_url), hasControlledFile: Boolean(text(row.storage_path)), fileName: text(row.file_name) } satisfies LearningResource];
  });
  const recordings = (recordingResult.data ?? []).flatMap((raw) => mapRecording(object(raw), sessionById, now, true));
  const session = { ...baseSession, physicalLocation: course.deliveryRoute === "PL" ? text(sessionResult.data.physical_location) : null };
  return {
    course,
    session,
    summary: summaryResult.data ? mapSummary(object(summaryResult.data), baseSession.title) : null,
    resources,
    recordings,
    previousSession: currentIndex > 0 ? { id: siblings[currentIndex - 1].id, title: siblings[currentIndex - 1].title } : null,
    nextSession: currentIndex >= 0 && currentIndex < siblings.length - 1 ? { id: siblings[currentIndex + 1].id, title: siblings[currentIndex + 1].title } : null,
    liveAccess: ["PL", "RP", "DR-E"].includes(course.deliveryRoute ?? "") ? { state: "not_applicable", message: null, href: null } : liveClassState(object(sessionResult.data), now, sessionId),
  };
}

export const getStudentSessionDetail = cache(loadStudentSessionDetail);

function liveClassState(row: Record<string, unknown>, now: Date, sessionId: string): LiveClassAccess {
  const delivery = text(row.delivery_mode);
  if (delivery !== "online" && delivery !== "hybrid") return { state: "not_applicable", message: null, href: null };
  const status = text(row.session_status);
  if (status !== "scheduled" && status !== "live") return { state: "unavailable", message: "Live class access is not available for this session.", href: null };
  if (!safeHttpUrl(row.live_join_url)) return { state: "missing", message: "Live class access has not yet been published.", href: null };
  if (status === "live") return { state: "available", message: null, href: `/api/student/sessions/${sessionId}/join` };
  const start = text(row.scheduled_start_at);
  if (!start) return { state: "not_scheduled", message: "Live access will become available after the class time is published.", href: null };
  const startTime = Date.parse(start);
  const end = text(row.scheduled_end_at);
  const endTime = end ? Date.parse(end) : startTime + 3 * 60 * 60 * 1000;
  if (now.valueOf() < startTime - 30 * 60 * 1000) return { state: "too_early", message: "Live access will become available shortly before class.", href: null };
  if (now.valueOf() > endTime + 30 * 60 * 1000) return { state: "ended", message: "The live access window for this class has ended.", href: null };
  return { state: "available", message: null, href: `/api/student/sessions/${sessionId}/join` };
}

export async function getStudentLiveClassTarget(sessionId: string) {
  const detail = await getStudentSessionDetail(sessionId);
  if (!detail || detail.liveAccess.state !== "available") return null;
  const context = await resolveStudentLearningContext();
  const result = await context.supabase.from("class_sessions").select("live_join_url").eq("id", sessionId).maybeSingle();
  fail("live class target lookup", result.error);
  return safeHttpUrl(result.data?.live_join_url);
}

export async function getStudentRecordingTarget(recordingId: string) {
  if (!isUuid(recordingId)) return null;
  const context = await resolveStudentLearningContext();
  const result = await context.supabase.from("class_recordings").select("id, class_session_id, external_url, embed_url, recording_status, access_level, available_from, available_until").eq("id", recordingId).eq("recording_status", "available").eq("access_level", "enrolled_students").maybeSingle();
  fail("recording access lookup", result.error);
  if (!result.data || recordingAvailability(object(result.data), new Date()) !== "available") return null;
  const session = await getStudentSessionDetail(result.data.class_session_id);
  if (!session) return null;
  return safeHttpUrl(result.data.external_url) ?? safeHttpUrl(result.data.embed_url);
}
