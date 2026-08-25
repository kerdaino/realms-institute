import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { LmsAdminDataError } from "@/lib/lms/adminData";
import { object, relation } from "@/lib/lms/sessionData";

export type ClassSummaryFilters = {
  cohort?: string;
  course?: string;
  facilitator?: string;
  session?: string;
  status?: string;
};

export const classSummaryQueueLabels = {
  draft: "Draft",
  submitted: "Awaiting Review",
  changes_requested: "Changes Requested",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
  superseded: "Superseded",
} as const;

export async function fetchAdminClassSummaries(supabase: SupabaseClient, filters: ClassSummaryFilters = {}) {
  const [summaries, sessions, facilitators] = await Promise.all([
    supabase
      .from("class_summaries")
      .select("*, class_sessions(id, title, session_number, scheduled_start_at, facilitator_id, facilitators(id, display_name), cohort_courses(id, cohorts(id, code, name), courses(id, code, title), facilitator_course_assignments(facilitator_id, facilitators(id, display_name))))")
      .order("updated_at", { ascending: false })
      .limit(5000),
    supabase
      .from("class_sessions")
      .select("id, title, session_number, scheduled_start_at, facilitator_id, cohort_courses(id, cohorts(id, code, name), courses(id, code, title), facilitator_course_assignments(facilitator_id, facilitators(id, display_name)))")
      .order("scheduled_start_at", { ascending: false, nullsFirst: false })
      .limit(5000),
    supabase.from("facilitators").select("id, display_name").eq("facilitator_status", "active").order("display_name"),
  ]);
  if (summaries.error || sessions.error || facilitators.error) throw new LmsAdminDataError("Class-summary review queue could not be loaded.");

  const allRows = (summaries.data ?? []).map((summary) => {
    const session = relation(summary.class_sessions);
    const offering = relation(session.cohort_courses);
    const directFacilitator = relation(session.facilitators);
    const courseFacilitators = relationList(offering.facilitator_course_assignments).map((assignment) => relation(assignment.facilitators)).filter((facilitator) => facilitator.id);
    const rowFacilitators = directFacilitator.id ? [directFacilitator] : courseFacilitators;
    return {
      summary,
      session,
      offering,
      cohort: relation(offering.cohorts),
      course: relation(offering.courses),
      facilitator: { id: rowFacilitators[0]?.id, display_name: rowFacilitators.map((facilitator) => String(facilitator.display_name)).join(", ") || "Course assignment" },
      facilitatorIds: rowFacilitators.map((facilitator) => String(facilitator.id)),
    };
  });
  const metrics = Object.fromEntries(Object.keys(classSummaryQueueLabels).map((status) => [status, allRows.filter((row) => row.summary.summary_status === status).length])) as Record<keyof typeof classSummaryQueueLabels, number>;
  const rows = allRows.filter((row) => {
    if (filters.cohort && row.cohort.id !== filters.cohort) return false;
    if (filters.course && row.course.id !== filters.course) return false;
    if (filters.facilitator && !row.facilitatorIds.includes(filters.facilitator)) return false;
    if (filters.session && row.session.id !== filters.session) return false;
    if (filters.status && row.summary.summary_status !== filters.status) return false;
    return true;
  });
  const sessionOptions: Array<Record<string, unknown> & { cohort: Record<string, unknown>; course: Record<string, unknown> }> = (sessions.data ?? []).map((session) => {
    const offering = relation(session.cohort_courses);
    return { ...object(session), cohort: relation(offering.cohorts), course: relation(offering.courses) };
  });
  const cohorts = uniqueOptions(sessionOptions.map((item) => item.cohort));
  const courses = uniqueOptions(sessionOptions.map((item) => item.course));
  return { rows, metrics, options: { cohorts, courses, sessions: sessionOptions, facilitators: facilitators.data ?? [] } };
}

function uniqueOptions(values: Record<string, unknown>[]) {
  return [...new Map(values.filter((value) => value.id).map((value) => [String(value.id), value])).values()];
}

function relationList(value: unknown) { return Array.isArray(value) ? value.map(object) : []; }
