import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase administrative environment variables are required.");

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const cohortCode = "RSD-AUG-2026";
const register = [
  ["Pastor Arome Iduh", ["RSD-DIS 101", "RSD-DIS 102"], "lead"],
  ["Otache Imanche", ["RSD-DIS 103"], "lead"],
  ["Pastor Onyeka", ["RSD-DIS 104"], "lead"],
  ["Minister Daniel", ["RSD-DIS 105", "RSD-DIS 106"], "lead"],
  ["Oluwatobi Adekunle", ["RSD-DIS 107"], "lead"],
  ["REALMS Faculty Team", ["RSD-DIS 108"], "lead"],
  ["Oluwatobi Adekunle", ["RSD-DIS 108"], "co_facilitator"],
  ["Oluwatobi Adekunle", ["RSD-WEB 101", "RSD-WEB 102", "RSD-WEB 103", "RSD-WEB 104", "RSD-WEB 105", "RSD-WEB 106", "RSD-WEB 107", "RSD-WEB 108", "RSD-WEB 190"], "lead"],
  ["Oluwatobi Adekunle", ["RSD-CYB 101", "RSD-CYB 102", "RSD-CYB 103", "RSD-CYB 104", "RSD-CYB 105", "RSD-CYB 106", "RSD-CYB 107", "RSD-CYB 108", "RSD-CYB 190"], "lead"],
];

async function load(table, select, column, value) {
  const result = await supabase.from(table).select(select).eq(column, value);
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
  return result.data;
}

const cohorts = await load("cohorts", "id, code", "code", cohortCode);
if (cohorts.length !== 1) throw new Error(`Expected exactly one ${cohortCode} cohort.`);
const cohortId = cohorts[0].id;
const { data: courses, error: courseError } = await supabase.from("courses").select("id, code");
const { data: facilitators, error: facilitatorError } = await supabase.from("facilitators").select("id, display_name");
const { data: offerings, error: offeringError } = await supabase.from("cohort_courses").select("id, course_id").eq("cohort_id", cohortId);
if (courseError || facilitatorError || offeringError) throw new Error("The approved register dependencies could not be loaded.");

const courseByCode = new Map(courses.map((item) => [item.code, item.id]));
const facilitatorByName = new Map(facilitators.map((item) => [item.display_name, item.id]));
const offeringByCourse = new Map(offerings.map((item) => [item.course_id, item.id]));
const rows = [];
for (const [name, codes, role] of register) {
  const facilitatorId = facilitatorByName.get(name);
  if (!facilitatorId) throw new Error(`Approved facilitator is missing: ${name}`);
  for (const code of codes) {
    const courseId = courseByCode.get(code);
    const cohortCourseId = courseId ? offeringByCourse.get(courseId) : null;
    if (!cohortCourseId) throw new Error(`Cohort course is missing: ${code}`);
    rows.push({ facilitator_id: facilitatorId, cohort_course_id: cohortCourseId, assignment_role: role });
  }
}

const { error: assignmentError } = await supabase.from("facilitator_course_assignments").upsert(rows, { onConflict: "facilitator_id,cohort_course_id,assignment_role", ignoreDuplicates: true });
if (assignmentError) throw new Error(`Assignments: ${assignmentError.message}`);
const facilitatorIds = [...new Set(rows.map((item) => item.facilitator_id))];
const { data: savedAssignments, error: savedAssignmentError } = await supabase.from("facilitator_course_assignments").select("id, facilitator_id, cohort_course_id, assignment_role").in("facilitator_id", facilitatorIds);
const { data: auditLogs, error: auditError } = await supabase.from("audit_logs").select("entity_id, metadata").eq("action", "facilitator_assigned_to_course").eq("entity_type", "facilitator").in("entity_id", facilitatorIds);
if (savedAssignmentError || auditError) throw new Error("Assignment audit state could not be loaded.");
const approvedKeys = new Set(rows.map((item) => `${item.facilitator_id}:${item.cohort_course_id}:${item.assignment_role}`));
const auditedKeys = new Set(auditLogs.map((item) => `${item.entity_id}:${item.metadata?.cohort_course_id}:${item.metadata?.assignment_role}`));
const auditRows = savedAssignments.filter((item) => approvedKeys.has(`${item.facilitator_id}:${item.cohort_course_id}:${item.assignment_role}`) && !auditedKeys.has(`${item.facilitator_id}:${item.cohort_course_id}:${item.assignment_role}`)).map((item) => ({ action: "facilitator_assigned_to_course", entity_type: "facilitator", entity_id: item.facilitator_id, metadata: { assignment_id: item.id, cohort_course_id: item.cohort_course_id, assignment_role: item.assignment_role, source: "build_2_approved_register_seed" } }));
if (auditRows.length) { const { error } = await supabase.from("audit_logs").insert(auditRows); if (error) throw new Error(`Assignment audit: ${error.message}`); }
const { count, error: verifyError } = await supabase.from("facilitator_course_assignments").select("id", { count: "exact", head: true }).in("facilitator_id", [...new Set(rows.map((item) => item.facilitator_id))]);
if (verifyError) throw new Error(`Verification: ${verifyError.message}`);
console.log(JSON.stringify({ cohort: cohortCode, approvedAssignments: rows.length, totalAssignmentsForApprovedFacilitators: count, auditEventsAdded: auditRows.length }));
