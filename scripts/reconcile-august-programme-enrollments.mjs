import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase administrative environment is required.");

const supabase = createClient(url, key, { auth: { persistSession: false } });
const cohortCode = "RSD-AUG-2026";
const reason = "Lifecycle reconciliation — onboarding completed but programme enrolment remained pending_onboarding";

const cohort = await supabase.from("cohorts").select("id, code, status").eq("code", cohortCode).single();
if (cohort.error || cohort.data.status !== "active") throw new Error("The August 2026 cohort is not active.");

const query = await supabase.from("student_enrollments").select("id, student_id, cohort_id, enrolment_status, discipleship_route, skill_pathway, students!inner(student_number, legal_name, student_status, onboarding_status), course_enrollments(id, enrollment_status)").eq("cohort_id", cohort.data.id).eq("enrolment_status", "pending_onboarding").eq("students.student_status", "active").eq("students.onboarding_status", "completed");
if (query.error) throw query.error;

const eligible = (query.data ?? []).filter((row) => row.discipleship_route && row.skill_pathway && row.course_enrollments?.some((course) => ["active", "enrolled"].includes(course.enrollment_status)));
const report = eligible.map((row) => ({ enrollment_id: row.id, student_id: row.students.student_number, name: row.students.legal_name, previous_status: row.enrolment_status, new_status: "active" }));
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", cohort: cohortCode, count: report.length, enrollments: report }, null, 2));
if (eligible.length !== 12) throw new Error(`Safety stop: expected exactly 12 eligible enrolments, found ${eligible.length}.`);
if (!apply) process.exit(0);

for (const row of eligible) {
  const changed = await supabase.from("student_enrollments").update({ enrolment_status: "active", updated_at: new Date().toISOString() }).eq("id", row.id).eq("enrolment_status", "pending_onboarding").select("id, enrolment_status").single();
  if (changed.error) throw new Error(`Activation failed for ${row.students.student_number}: ${changed.error.message}`);
  const audit = await supabase.from("audit_logs").insert({
    action: "programme_enrollment_activated",
    entity_type: "student_enrollment",
    entity_id: row.id,
    actor_user_id: null,
    metadata: { previous_status: "pending_onboarding", new_status: "active", reason, actor_identity: "REALMS Admin", student_id: row.student_id, cohort_id: row.cohort_id },
  });
  if (audit.error) {
    const rollback = await supabase.from("student_enrollments").update({ enrolment_status: "pending_onboarding", updated_at: new Date().toISOString() }).eq("id", row.id).eq("enrolment_status", "active");
    throw new Error(`Audit failed for ${row.students.student_number}; activation ${rollback.error ? "could not be rolled back" : "was rolled back"}.`);
  }
  console.log(`Activated ${row.students.student_number} — ${row.students.legal_name}`);
}
