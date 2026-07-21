import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { LmsAdminDataError } from "@/lib/lms/adminData";
import { getGraduationConfirmationEligibility } from "@/lib/lms/graduationService";

type Row = Record<string, unknown>;
function fail(error: { code?: string } | null, message: string) { if (error) throw new LmsAdminDataError(message); }
function object(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function relation(value: unknown): Row { return Array.isArray(value) ? object(value[0]) : object(value); }

export type GraduationFilters = { cohort?: string; route?: string; skill?: string; outcome?: string; confirmation?: string; conversion?: string; award?: string };

export async function fetchAdminGraduationDashboard(supabase: SupabaseClient, filters: GraduationFilters = {}) {
  const [enrollments, confirmations, alumniPrograms, awards, cohorts] = await Promise.all([
    supabase.from("student_enrollments").select("*, students(id, student_number, legal_name, preferred_name, email), cohorts(id, code, name), student_programme_results(*)").order("enrolled_at", { ascending: false }),
    supabase.from("graduation_confirmations").select("*"),
    supabase.from("alumni_programme_records").select("id, student_enrollment_id, alumni_id"),
    supabase.from("institutional_awards").select("id, student_enrollment_id, award_status"),
    supabase.from("cohorts").select("id, code, name").order("start_date", { ascending: false, nullsFirst: false }),
  ]);
  for (const [result, message] of [[enrollments, "Graduation candidates could not be loaded."], [confirmations, "Graduation confirmations could not be loaded."], [alumniPrograms, "Alumni conversion records could not be loaded."], [awards, "Award records could not be loaded."], [cohorts, "Cohort filters could not be loaded."]] as const) fail(result.error, message);
  const confirmationByEnrollment = new Map((confirmations.data ?? []).map((row) => [row.student_enrollment_id, row]));
  const programmeByEnrollment = new Map((alumniPrograms.data ?? []).map((row) => [row.student_enrollment_id, row]));
  const awardsByEnrollment = new Map<string, Row[]>();
  for (const award of awards.data ?? []) awardsByEnrollment.set(award.student_enrollment_id, [...(awardsByEnrollment.get(award.student_enrollment_id) ?? []), award]);
  const candidates = (enrollments.data ?? []).map((enrollment) => {
    const results = (enrollment.student_programme_results ?? []) as Row[];
    const result = [...results].sort((a, b) => Number(b.calculation_version) - Number(a.calculation_version))[0] ?? null;
    return { enrollment: object(enrollment), student: relation(enrollment.students), cohort: relation(enrollment.cohorts), result, confirmation: confirmationByEnrollment.get(enrollment.id) ?? null, alumniProgramme: programmeByEnrollment.get(enrollment.id) ?? null, awards: awardsByEnrollment.get(enrollment.id) ?? [] };
  });
  const filterOptions = {
    routes: [...new Set(candidates.map((row) => String(row.enrollment.discipleship_route ?? "")).filter(Boolean))].sort(),
    skills: [...new Set(candidates.map((row) => String(row.enrollment.skill_pathway ?? "")).filter(Boolean))].sort(),
    outcomes: [...new Set(candidates.map((row) => String(row.result?.result_outcome ?? "")).filter(Boolean))].sort(),
  };
  const rows = candidates.filter((row) => {
    if (!row.result) return false;
    if (filters.cohort && row.enrollment.cohort_id !== filters.cohort) return false;
    if (filters.route && row.enrollment.discipleship_route !== filters.route) return false;
    if (filters.skill && row.enrollment.skill_pathway !== filters.skill) return false;
    if (filters.outcome && row.result.result_outcome !== filters.outcome) return false;
    if (filters.confirmation && String(row.confirmation?.confirmation_status ?? "not_started") !== filters.confirmation) return false;
    if (filters.conversion && (filters.conversion === "converted") !== Boolean(row.alumniProgramme)) return false;
    if (filters.award === "not_created" && row.awards.length) return false;
    if (filters.award && filters.award !== "not_created" && !row.awards.some((award) => award.award_status === filters.award)) return false;
    return true;
  });
  const all = rows;
  const metrics = {
    publishedResults: all.filter((row) => row.result.result_status === "published").length,
    eligibleForCompletion: all.filter((row) => row.result.result_status === "published" && row.result.result_outcome === "eligible_for_completion" && row.result.all_graduation_gates_met).length,
    identityPending: all.filter((row) => row.confirmation && !row.confirmation.identity_reconciled).length,
    academicPending: all.filter((row) => row.confirmation && !row.confirmation.academic_record_reconciled).length,
    awaitingApproval: all.filter((row) => row.confirmation?.confirmation_status === "awaiting_approval").length,
    confirmedGraduates: all.filter((row) => ["approved", "completed"].includes(String(row.confirmation?.confirmation_status))).length,
    conversionPending: all.filter((row) => ["approved", "completed"].includes(String(row.confirmation?.confirmation_status)) && !row.alumniProgramme).length,
    converted: all.filter((row) => Boolean(row.alumniProgramme)).length,
    awardsPending: all.reduce((count, row) => count + row.awards.filter((award) => ["draft", "approved"].includes(String(award.award_status))).length, 0),
    awardsIssued: all.reduce((count, row) => count + row.awards.filter((award) => award.award_status === "issued").length, 0),
  };
  return { rows, metrics, cohorts: cohorts.data ?? [], filterOptions };
}

export async function fetchAdminGraduationDetail(supabase: SupabaseClient, studentEnrollmentId: string) {
  const eligibility = await getGraduationConfirmationEligibility(supabase, studentEnrollmentId);
  const confirmationId = eligibility.confirmation?.id ? String(eligibility.confirmation.id) : null;
  const events = confirmationId ? await supabase.from("graduation_confirmation_events").select("*").eq("graduation_confirmation_id", confirmationId).order("created_at", { ascending: false }) : { data: [], error: null };
  fail(events.error, "Graduation confirmation history could not be loaded.");
  const alumniProgramme = await supabase.from("alumni_programme_records").select("*, alumni(*)").eq("student_enrollment_id", studentEnrollmentId).maybeSingle();
  fail(alumniProgramme.error, "Alumni conversion record could not be loaded.");
  return { ...eligibility, events: events.data ?? [], alumniProgramme: alumniProgramme.data };
}

export async function fetchAdminAwards(supabase: SupabaseClient) {
  const [awards, templates] = await Promise.all([
    supabase.from("institutional_awards").select("*, alumni_programme_records!institutional_awards_alumni_programme_record_id_fkey(programme_name, cohort_name_snapshot, alumni(alumni_number, students!inner(legal_name)))").order("created_at", { ascending: false }),
    supabase.from("certificate_templates").select("*").order("created_at", { ascending: false }),
  ]);
  fail(awards.error, "Awards could not be loaded."); fail(templates.error, "Certificate templates could not be loaded.");
  return { awards: awards.data ?? [], templates: templates.data ?? [] };
}

export async function fetchAdminAwardDetail(supabase: SupabaseClient, awardId: string) {
  const [award, events] = await Promise.all([
    supabase.from("institutional_awards").select("*, certificate_templates(*), alumni_programme_records!institutional_awards_alumni_programme_record_id_fkey(*, alumni(*, students!inner(legal_name, preferred_name, email)))").eq("id", awardId).maybeSingle(),
    supabase.from("award_issuance_events").select("*").eq("institutional_award_id", awardId).order("created_at", { ascending: false }),
  ]);
  fail(award.error, "Award could not be loaded."); fail(events.error, "Award history could not be loaded.");
  if (!award.data) throw new LmsAdminDataError("Award not found.", 404);
  return { award: award.data, events: events.data ?? [] };
}

export async function fetchAdminAlumni(supabase: SupabaseClient) {
  const [alumni, programmes, awards, outcomes] = await Promise.all([
    supabase.from("alumni").select("*, students!inner(id, legal_name, preferred_name, email, phone)").order("alumni_since", { ascending: false, nullsFirst: false }),
    supabase.from("alumni_programme_records").select("id, alumni_id, cohort_name_snapshot, discipleship_route, skill_pathway"),
    supabase.from("institutional_awards").select("id, alumni_programme_record_id, award_status"),
    supabase.from("alumni_outcome_updates").select("*").order("created_at", { ascending: false }).limit(20),
  ]);
  for (const [result, message] of [[alumni, "Alumni could not be loaded."], [programmes, "Alumni programmes could not be loaded."], [awards, "Alumni awards could not be loaded."], [outcomes, "Recent alumni outcomes could not be loaded."]] as const) fail(result.error, message);
  const programmeByAlumni = new Map<string, Row[]>(); for (const programme of programmes.data ?? []) programmeByAlumni.set(programme.alumni_id, [...(programmeByAlumni.get(programme.alumni_id) ?? []), programme]);
  const issued = new Set((awards.data ?? []).filter((award) => award.award_status === "issued").map((award) => award.alumni_programme_record_id));
  const rows = (alumni.data ?? []).map((person) => ({ ...person, programmes: programmeByAlumni.get(person.id) ?? [] }));
  return { rows, outcomes: outcomes.data ?? [], metrics: { total: rows.length, active: rows.filter((row) => row.alumni_status === "active").length, programmes: programmes.data?.length ?? 0, archiveAccess: rows.filter((row) => row.learning_archive_access).length, awardsIssued: issued.size, awardsPending: (awards.data ?? []).filter((award) => ["draft", "approved"].includes(award.award_status)).length } };
}

export async function fetchAdminAlumniDetail(supabase: SupabaseClient, alumniId: string) {
  const alumni = await supabase.from("alumni").select("*, students!inner(*)").eq("id", alumniId).maybeSingle(); fail(alumni.error, "Alumni account could not be loaded."); if (!alumni.data) throw new LmsAdminDataError("Alumni account not found.", 404);
  const [programmes, archives, grants, reads, outcomes, conversions] = await Promise.all([
    supabase.from("alumni_programme_records").select("*, graduation_confirmations(*), student_programme_results(*), institutional_awards!institutional_awards_alumni_programme_record_id_fkey(*)").eq("alumni_id", alumniId),
    supabase.from("alumni_course_archives").select("*, alumni_programme_records!inner(alumni_id), alumni_summary_archive_items(id, archive_status)").eq("alumni_programme_records.alumni_id", alumniId),
    supabase.from("alumni_recording_access_grants").select("*, alumni_course_archives!inner(alumni_programme_records!inner(alumni_id)), class_recordings(title)").eq("alumni_course_archives.alumni_programme_records.alumni_id", alumniId),
    supabase.from("alumni_announcement_reads").select("*").eq("alumni_id", alumniId),
    supabase.from("alumni_outcome_updates").select("*").eq("alumni_id", alumniId).order("created_at", { ascending: false }),
    supabase.from("alumni_conversion_events").select("*").eq("alumni_id", alumniId).order("created_at", { ascending: false }),
  ]);
  for (const [result, message] of [[programmes, "Completed programmes could not be loaded."], [archives, "Learning archives could not be loaded."], [grants, "Recording grants could not be loaded."], [reads, "Announcement activity could not be loaded."], [outcomes, "Outcome updates could not be loaded."], [conversions, "Conversion history could not be loaded."]] as const) fail(result.error, message);
  const offeringIds = (archives.data ?? []).map((archive) => archive.cohort_course_id);
  const recordings = offeringIds.length ? await supabase.from("class_recordings").select("id, title, class_session_id, class_sessions!inner(cohort_course_id, title)").in("class_sessions.cohort_course_id", offeringIds).eq("recording_status", "available") : { data: [], error: null };
  fail(recordings.error, "Available alumni recordings could not be loaded.");
  return { alumni: alumni.data, programmes: programmes.data ?? [], archives: archives.data ?? [], grants: grants.data ?? [], recordings: recordings.data ?? [], reads: reads.data ?? [], outcomes: outcomes.data ?? [], conversions: conversions.data ?? [] };
}

export async function fetchAdminAnnouncements(supabase: SupabaseClient) { const result = await supabase.from("alumni_announcements").select("*, alumni_announcement_reads(id)").order("created_at", { ascending: false }); fail(result.error, "Alumni announcements could not be loaded."); return result.data ?? []; }
