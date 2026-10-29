import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/lms_programme_enrollment_lifecycle.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/admin/student-enrollments/[id]/activate/route.ts", import.meta.url), "utf8");
const results = readFileSync(new URL("../lib/lms/results.ts", import.meta.url), "utf8");

for (const guard of [
  "current_enrollment.enrolment_status <> 'pending_onboarding'",
  "linked_student.student_status <> 'active'",
  "linked_student.onboarding_status <> 'completed'",
  "linked_cohort.status <> 'active'",
  "for update",
  "programme_enrollment_activated",
]) assert.ok(sql.includes(guard), `Missing lifecycle guard: ${guard}`);
assert.ok(sql.includes("grant execute on function public.activate_programme_enrollment") && sql.includes("to service_role"));
assert.ok(route.includes("isAdminAuthenticated"));
assert.ok(results.includes('["skill", "capstone"].includes(input.courseCategory)'), "Capstone courses must use skill-pathway compatibility.");
console.log("Programme-enrolment lifecycle and capstone compatibility checks passed.");
