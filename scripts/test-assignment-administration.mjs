import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [migration, service, component, statusRoute, deadlineRoute, reopenRoute, studentPage, studentData, adminPage] = await Promise.all([
  read("supabase/lms_assignment_administration.sql"),
  read("lib/lms/assessmentService.ts"),
  read("components/admin/AssignmentRecord.tsx"),
  read("app/api/admin/assignments/[id]/status/route.ts"),
  read("app/api/admin/assignments/[id]/deadline/route.ts"),
  read("app/api/admin/assignments/[id]/reopen/route.ts"),
  read("app/student/(academic)/assignments/[assignmentId]/page.tsx"),
  read("lib/lms/assessmentData.ts"),
  read("app/admin/assignments/[id]/page.tsx"),
]);

const checks = [];
function check(name, fn) { fn(); checks.push(name); }

check("1 admin extends deadline successfully", () => assert.match(service, /rpc\("extend_assignment_deadline"/));
check("2 new deadline is visible through the student query", () => { assert.match(studentData, /from\("assignments"\).*assignment_status", "published"/s); assert.match(studentPage, /assignment\.due_at/); });
check("3 extension preserves submissions", () => assert.doesNotMatch(migration.match(/create or replace function public\.extend_assignment_deadline[\s\S]*?end;\n\$\$;/)?.[0] ?? "", /update public\.assignment_submissions|delete from public\.assignment_submissions/));
check("4 extension preserves grades", () => assert.doesNotMatch(migration.match(/create or replace function public\.extend_assignment_deadline[\s\S]*?end;\n\$\$;/)?.[0] ?? "", /assessment_grade_change_events|assignment_rubric_scores/));
check("5 extension audit records old and new deadline actor and reason", () => { assert.match(migration, /assignment_deadline_extended/); for (const field of ["previous_deadline", "new_deadline", "actor_identity", "reason"]) assert.match(migration, new RegExp(field)); });
check("6 extension cannot shorten a deadline", () => assert.match(migration, /p_new_deadline <= current_assignment\.due_at/));
check("7 admin closes through the atomic close RPC", () => { assert.match(statusRoute, /closeAssignment/); assert.match(migration, /assignment_status = 'closed'/); });
check("8 closed assignment is unavailable to student submission", () => assert.match(service, /eq\("assignment_status", "published"\)/));
check("9 close requires a confirmation dialog and reason", () => { assert.match(component, /Close assignment\?/); assert.match(component, /name="reason" required/); });
check("10 closed assignment shows Reopen action", () => assert.match(component, /assignment_status === "closed"[\s\S]*Reopen assignment/));
check("11 reopen with an existing future deadline works", () => assert.match(migration, /resulting_deadline := coalesce\(p_new_deadline, current_assignment\.due_at\)/));
check("12 expired reopen requires a new future deadline", () => { assert.match(migration, /current_assignment\.due_at <= now\(\).*p_new_deadline is null/s); assert.match(migration, /p_new_deadline <= now\(\)/); });
check("13 student can submit after reopened status becomes published", () => { assert.match(migration, /assignment_status = 'published'/); assert.match(service, /eq\("assignment_status", "published"\)/); });
check("14 reopening does not create a duplicate attempt", () => assert.doesNotMatch(migration.match(/create or replace function public\.reopen_assignment[\s\S]*?end;\n\$\$;/)?.[0] ?? "", /insert into public\.assignment_submissions/));
check("15 reopening leaves graded submissions unchanged", () => assert.doesNotMatch(migration.match(/create or replace function public\.reopen_assignment[\s\S]*?end;\n\$\$;/)?.[0] ?? "", /submission_status|score_points|graded_at/));
check("16 reopening preserves close history", () => { assert.match(migration, /assignment_closed/); assert.doesNotMatch(migration, /delete from public\.audit_logs/); });
check("17 reopen is audited with state deadline actor and reason", () => { assert.match(migration, /assignment_reopened/); for (const field of ["previous_state", "resulting_state", "previous_deadline", "new_deadline", "actor_identity", "reason"]) assert.match(migration, new RegExp(field)); });
check("18 routes require admin and RPCs deny authenticated callers", () => { for (const route of [statusRoute, deadlineRoute, reopenRoute]) assert.match(route, /isAdminAuthenticated/); assert.match(migration, /from public, anon, authenticated/g); assert.match(adminPage, /requireAdmin/); });
check("19 stale lock version fails safely", () => { assert.match(migration, /for update/); assert.match(migration, /lock_version <> p_expected_version/); assert.match(service, /error\?\.code === "40001"/); });
check("20 existing late and revision workflows remain canonical", () => { assert.match(service, /allow_late_submission/); assert.match(service, /review_outcome !== "revision_required"/); assert.match(studentPage, /latest\.review_outcome === "revision_required"/); });

console.log(`Assignment administration tests passed (${checks.length}/20):\n- ${checks.join("\n- ")}`);
