import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Cohort, Profile, Student, StudentEnrollment } from "@/lib/lms/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { selectCurrentStudentEnrollment } from "@/lib/lms/currentEnrollment";
import { deriveStudentLifecycle, type StudentLifecycle } from "@/lib/lms/studentLifecycle";

const dashboardErrorMessage = "We could not load part of your learning dashboard right now. Please refresh the page or contact REALMS Institute if the issue continues.";

export class StudentDashboardDataError extends Error {
  constructor() {
    super(dashboardErrorMessage);
    this.name = "StudentDashboardDataError";
  }
}

export type StudentCourse = {
  courseEnrollmentId: string;
  offeringId: string;
  code: string;
  title: string;
  category: string;
  discipleshipRoute: string | null;
  skillPathway: string | null;
  deliveryMode: string | null;
  schedule: string | null;
  sequenceNumber: number | null;
  deliveryRoute: string | null;
};

export type StudentSession = {
  id: string;
  kind: "class_session" | "cohort_event";
  href: string | null;
  offeringId: string;
  title: string;
  courseCode: string;
  courseTitle: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  timezone: string;
  deliveryMode: string;
  physicalLocation: string | null;
  status: string;
  isToday: boolean;
  isPast: boolean;
};

export type StudentSummary = {
  id: string;
  sessionId: string;
  title: string;
  courseCode: string;
  courseTitle: string;
  sessionTitle: string;
  sessionDate: string | null;
  versionNumber: number;
  publishedAt: string | null;
};

export type StudentRecording = {
  id: string;
  sessionId: string;
  title: string;
  courseCode: string;
  courseTitle: string;
  sessionTitle: string;
  durationSeconds: number | null;
  availableFrom: string | null;
};

export type StudentResource = {
  id: string;
  title: string;
  description: string | null;
  resourceType: string;
  externalUrl: string | null;
  hasControlledFile: boolean;
  fileName: string | null;
  courseCode: string;
  courseTitle: string;
  sessionId: string;
  sessionTitle: string;
};

type DashboardStudent = Pick<Student, "id" | "student_number" | "legal_name" | "preferred_name" | "email" | "phone" | "country" | "city" | "student_status" | "onboarding_status" | "orientation_completed_at" | "matriculated_at">;
type DashboardEnrollment = Pick<StudentEnrollment, "id" | "cohort_id" | "discipleship_route" | "skill_pathway" | "skill_learning_mode" | "enrolment_status" | "enrolled_at"> & { academic_standing: string };
type DashboardCohort = Pick<Cohort, "id" | "code" | "name" | "school" | "programme" | "orientation_date" | "matriculation_date">;
type DashboardProfile = Pick<Profile, "id" | "full_name" | "preferred_name" | "email" | "phone" | "avatar_url" | "account_status">;

export type StudentDashboardData = {
  profile: DashboardProfile | null;
  student: DashboardStudent | null;
  enrollment: DashboardEnrollment | null;
  cohort: DashboardCohort | null;
  greeting: string;
  displayName: string;
  academicStatus: string;
  lifecycle: StudentLifecycle;
  discipleshipCourses: StudentCourse[];
  skillCourses: StudentCourse[];
  sessions: StudentSession[];
  upcomingSessions: StudentSession[];
  pastSessions: StudentSession[];
  todaysSession: StudentSession | null;
  recentSummaries: StudentSummary[];
  availableRecordings: StudentRecording[];
  resources: StudentResource[];
};

type LoadOptions = { includeResources?: boolean };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function relation(value: unknown) {
  return Array.isArray(value) ? object(value[0]) : object(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeExternalUrl(value: unknown) {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:") ? url.toString() : null;
  } catch {
    return null;
  }
}

function reportFailure(label: string, error: { code?: string; message?: string } | null) {
  if (!error) return;
  console.error(`Student dashboard ${label} failed`, { code: error.code, message: error.message });
  throw new StudentDashboardDataError();
}

function greetingForNow(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-NG", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(now));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function localDateKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Africa/Lagos" }).format(typeof value === "string" ? new Date(value) : value);
}

function mapCourse(row: Record<string, unknown>): StudentCourse | null {
  const offering = relation(row.cohort_courses);
  const course = relation(offering.courses);
  const offeringId = text(offering.id);
  const courseEnrollmentId = text(row.id);
  const code = text(course.code);
  const title = text(course.title);
  if (!courseEnrollmentId || !offeringId || !code || !title) return null;
  return {
    courseEnrollmentId,
    offeringId,
    code,
    title,
    category: text(course.course_category) ?? "course",
    discipleshipRoute: text(course.discipleship_route),
    skillPathway: text(course.skill_pathway),
    deliveryMode: text(offering.delivery_mode),
    schedule: text(offering.schedule_text),
    sequenceNumber: number(course.sequence_number),
    deliveryRoute: text(row.delivery_route),
  };
}

function approvedSessionDelivery(configured: string | null, route: string | null) {
  if (route === "RP" || route === "DR-E") return "recorded_primary";
  if (configured !== "hybrid") return configured ?? "Not available";
  if (route === "PL") return "physical";
  if (route === "OL") return "online";
  return configured;
}

function optionalCalendarTable(error: { code?: string; message?: string } | null) {
  return Boolean(error && (["42P01", "PGRST205"].includes(error.code ?? "") || /cohort_events/i.test(error.message ?? "")));
}

function byCourseSequence(a: StudentCourse, b: StudentCourse) {
  return (a.sequenceNumber ?? Number.MAX_SAFE_INTEGER) - (b.sequenceNumber ?? Number.MAX_SAFE_INTEGER) || a.code.localeCompare(b.code, undefined, { numeric: true });
}

async function loadStudentDashboardData(profileId: string, options: LoadOptions = {}, client?: SupabaseClient): Promise<StudentDashboardData> {
  const supabase = client ?? await createSupabaseServerClient();
  const now = new Date();
  const [profileResult, studentResult] = await Promise.all([
    supabase.from("profiles").select("id, full_name, preferred_name, email, phone, avatar_url, account_status").eq("id", profileId).maybeSingle(),
    supabase.from("students").select("id, student_number, legal_name, preferred_name, email, phone, country, city, student_status, onboarding_status, orientation_completed_at, matriculated_at").eq("profile_id", profileId).maybeSingle(),
  ]);
  reportFailure("profile lookup", profileResult.error);
  reportFailure("student lookup", studentResult.error);

  const profile = profileResult.data as DashboardProfile | null;
  const student = studentResult.data as DashboardStudent | null;
  const displayName = profile?.preferred_name || student?.preferred_name || profile?.full_name?.split(/\s+/)[0] || student?.legal_name.split(/\s+/)[0] || "Student";
  const lifecycle = student
    ? deriveStudentLifecycle({
      studentStatus: student.student_status,
      onboardingStatus: student.onboarding_status,
      orientationCompletedAt: student.orientation_completed_at,
      matriculatedAt: student.matriculated_at,
      portalAccountStatus: profile?.account_status,
    })
    : deriveStudentLifecycle({
      studentStatus: "pending_onboarding",
      onboardingStatus: "not_started",
      portalAccountStatus: profile?.account_status,
    });
  const base: StudentDashboardData = {
    profile,
    student,
    enrollment: null,
    cohort: null,
    greeting: greetingForNow(now),
    displayName,
    academicStatus: student ? lifecycle.academicStatus : "Activation Pending",
    lifecycle,
    discipleshipCourses: [],
    skillCourses: [],
    sessions: [],
    upcomingSessions: [],
    pastSessions: [],
    todaysSession: null,
    recentSummaries: [],
    availableRecordings: [],
    resources: [],
  };
  if (!student) return base;

  const enrollmentResult = await selectCurrentStudentEnrollment<DashboardEnrollment>(supabase, student.id, "id, cohort_id, discipleship_route, skill_pathway, skill_learning_mode, enrolment_status, enrolled_at, academic_standing");
  reportFailure("enrollment lookup", enrollmentResult.error);
  const enrollment = enrollmentResult.data as DashboardEnrollment | null;
  base.enrollment = enrollment;
  base.lifecycle = deriveStudentLifecycle({
    studentStatus: student.student_status,
    enrollmentStatus: enrollment?.enrolment_status,
    onboardingStatus: student.onboarding_status,
    orientationCompletedAt: student.orientation_completed_at,
    matriculatedAt: student.matriculated_at,
    portalAccountStatus: profile?.account_status,
  });
  base.academicStatus = base.lifecycle.academicStatus;
  if (!enrollment) return base;

  const [cohortResult, courseEnrollmentResult] = await Promise.all([
    supabase.from("cohorts").select("id, code, name, school, programme, orientation_date, matriculation_date").eq("id", enrollment.cohort_id).maybeSingle(),
    supabase.from("course_enrollments").select("id, enrollment_status, delivery_route, cohort_courses(id, delivery_mode, schedule_text, courses(id, code, title, course_category, discipleship_route, skill_pathway, sequence_number))").eq("student_enrollment_id", enrollment.id).in("enrollment_status", ["active", "enrolled"]),
  ]);
  reportFailure("cohort lookup", cohortResult.error);
  reportFailure("course enrollment lookup", courseEnrollmentResult.error);
  base.cohort = cohortResult.data as DashboardCohort | null;

  const courses = (courseEnrollmentResult.data ?? []).map((row) => mapCourse(object(row))).filter((course): course is StudentCourse => Boolean(course));
  base.discipleshipCourses = courses.filter((course) => course.category === "discipleship" && course.discipleshipRoute === enrollment.discipleship_route).sort(byCourseSequence);
  base.skillCourses = courses.filter((course) => course.category === "skill" && course.skillPathway === enrollment.skill_pathway).sort(byCourseSequence);
  const offeringIds = [...new Set(courses.map((course) => course.offeringId))];
  if (!offeringIds.length) return base;

  const [sessionResult, eventResult] = await Promise.all([
    supabase.from("class_sessions").select("id, cohort_course_id, title, scheduled_start_at, scheduled_end_at, timezone, delivery_mode, physical_location, session_status, visibility_status").in("cohort_course_id", offeringIds).eq("visibility_status", "enrolled_only").order("scheduled_start_at", { ascending: true, nullsFirst: false }),
    supabase.from("cohort_events").select("id, cohort_id, title, scheduled_start_at, scheduled_end_at, timezone, delivery_mode, physical_location, event_status, visibility_status").eq("cohort_id", enrollment.cohort_id).eq("visibility_status", "enrolled_only").order("scheduled_start_at", { ascending: true }),
  ]);
  reportFailure("session lookup", sessionResult.error);
  if (eventResult.error && !optionalCalendarTable(eventResult.error)) reportFailure("cohort event lookup", eventResult.error);
  const courseByOffering = new Map(courses.map((course) => [course.offeringId, course]));
  const today = localDateKey(now);
  const sessions: StudentSession[] = (sessionResult.data ?? []).flatMap((raw) => {
    const row = object(raw);
    const offeringId = text(row.cohort_course_id);
    const id = text(row.id);
    const title = text(row.title);
    const course = offeringId ? courseByOffering.get(offeringId) : null;
    if (!offeringId || !id || !title || !course) return [];
    const scheduledStartAt = text(row.scheduled_start_at);
    return [{
      id,
      kind: "class_session",
      href: `/student/sessions/${id}`,
      offeringId,
      title,
      courseCode: course.code,
      courseTitle: course.title,
      scheduledStartAt,
      scheduledEndAt: text(row.scheduled_end_at),
      timezone: text(row.timezone) ?? "Africa/Lagos",
      deliveryMode: approvedSessionDelivery(text(row.delivery_mode) ?? course.deliveryMode, course.deliveryRoute),
      physicalLocation: course.deliveryRoute === "PL" ? text(row.physical_location) : null,
      status: text(row.session_status) ?? "scheduled",
      isToday: Boolean(scheduledStartAt && localDateKey(scheduledStartAt) === today),
      isPast: Boolean(scheduledStartAt && Date.parse(scheduledStartAt) < now.valueOf()),
    } satisfies StudentSession];
  });
  if (!eventResult.error) for (const raw of eventResult.data ?? []) {
    const row = object(raw); const id = text(row.id); const title = text(row.title); const scheduledStartAt = text(row.scheduled_start_at);
    if (!id || !title) continue;
    sessions.push({ id, kind: "cohort_event", href: null, offeringId: "cohort", title, courseCode: "COHORT", courseTitle: base.cohort?.name ?? "Cohort activity", scheduledStartAt, scheduledEndAt: text(row.scheduled_end_at), timezone: text(row.timezone) ?? "Africa/Lagos", deliveryMode: text(row.delivery_mode) ?? "online", physicalLocation: text(row.physical_location), status: text(row.event_status) ?? "scheduled", isToday: Boolean(scheduledStartAt && localDateKey(scheduledStartAt) === today), isPast: Boolean(scheduledStartAt && Date.parse(scheduledStartAt) < now.valueOf()) });
  }
  sessions.sort((a, b) => Date.parse(a.scheduledStartAt ?? "9999-12-31") - Date.parse(b.scheduledStartAt ?? "9999-12-31"));
  base.sessions = sessions;
  base.upcomingSessions = sessions.filter((session) => session.status === "scheduled" && Boolean(session.scheduledStartAt && Date.parse(session.scheduledStartAt) >= now.valueOf())).slice(0, 5);
  base.pastSessions = sessions.filter((session) => Boolean(session.scheduledStartAt && Date.parse(session.scheduledStartAt) < now.valueOf())).sort((a, b) => Date.parse(b.scheduledStartAt ?? "") - Date.parse(a.scheduledStartAt ?? ""));
  base.todaysSession = sessions.find((session) => session.isToday && (session.status === "scheduled" || session.status === "live")) ?? null;

  const sessionIds = sessions.map((session) => session.id);
  if (!sessionIds.length) return base;
  const contentQueries = [
    supabase.from("class_summaries").select("id, class_session_id, title, version_number, published_at, updated_at, summary_status").in("class_session_id", sessionIds).eq("summary_status", "published").order("published_at", { ascending: false, nullsFirst: false }).limit(3),
    supabase.from("class_recordings").select("id, class_session_id, title, duration_seconds, recording_status, access_level, available_from, available_until, created_at").in("class_session_id", sessionIds).eq("recording_status", "available").eq("access_level", "enrolled_students").order("available_from", { ascending: false, nullsFirst: false }).limit(3),
  ];
  const [summaryResult, recordingResult] = await Promise.all(contentQueries);
  reportFailure("summary lookup", summaryResult.error);
  reportFailure("recording lookup", recordingResult.error);
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  base.recentSummaries = (summaryResult.data ?? []).flatMap((raw) => {
    const row = object(raw);
    const session = sessionById.get(text(row.class_session_id) ?? "");
    const id = text(row.id);
    if (!session || !id) return [];
    return [{ id, sessionId: session.id, title: text(row.title) ?? session.title, courseCode: session.courseCode, courseTitle: session.courseTitle, sessionTitle: session.title, sessionDate: session.scheduledStartAt, versionNumber: number(row.version_number) ?? 1, publishedAt: text(row.published_at) } satisfies StudentSummary];
  });
  base.availableRecordings = (recordingResult.data ?? []).flatMap((raw) => {
    const row = object(raw);
    const session = sessionById.get(text(row.class_session_id) ?? "");
    const id = text(row.id);
    const availableFrom = text(row.available_from);
    const availableUntil = text(row.available_until);
    if (!session || !id || (availableFrom && Date.parse(availableFrom) > now.valueOf()) || (availableUntil && Date.parse(availableUntil) < now.valueOf())) return [];
    return [{ id, sessionId: session.id, title: text(row.title) ?? session.title, courseCode: session.courseCode, courseTitle: session.courseTitle, sessionTitle: session.title, durationSeconds: number(row.duration_seconds), availableFrom } satisfies StudentRecording];
  });

  if (options.includeResources) {
    const resourceResult = await supabase.from("session_resources").select("id, class_session_id, title, description, resource_type, external_url, storage_path, file_name, access_level, is_active, sort_order").in("class_session_id", sessionIds).eq("is_active", true).eq("access_level", "enrolled_students").order("sort_order").order("created_at");
    reportFailure("resource lookup", resourceResult.error);
    base.resources = (resourceResult.data ?? []).flatMap((raw) => {
      const row = object(raw);
      const session = sessionById.get(text(row.class_session_id) ?? "");
      const id = text(row.id);
      const title = text(row.title);
      if (!session || !id || !title) return [];
      return [{ id, title, description: text(row.description), resourceType: text(row.resource_type) ?? "resource", externalUrl: safeExternalUrl(row.external_url), hasControlledFile: Boolean(text(row.storage_path)), fileName: text(row.file_name), courseCode: session.courseCode, courseTitle: session.courseTitle, sessionId: session.id, sessionTitle: session.title } satisfies StudentResource];
    });
  }
  return base;
}

export const getStudentDashboardData = cache(async (profileId: string, includeResources = false) => loadStudentDashboardData(profileId, { includeResources }));

export async function getStudentDashboardDataForClient(profileId: string, supabase: SupabaseClient, options: LoadOptions = {}) {
  return loadStudentDashboardData(profileId, options, supabase);
}
