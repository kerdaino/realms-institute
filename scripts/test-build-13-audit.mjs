import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFile(join(root, path), "utf8");

async function filesBelow(path) {
  const output = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && [".git", ".next", "node_modules"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else output.push(path);
    }
  }
  await visit(join(root, path));
  return output;
}

const adminRoutes = (await filesBelow("app/api/admin")).filter((path) => path.endsWith("route.ts"));
const unguardedAdminRoutes = [];
for (const path of adminRoutes) {
  const source = await readFile(path, "utf8");
  const name = relative(root, path);
  if (name.endsWith("/login/route.ts") || name.endsWith("/logout/route.ts")) continue;
  if (!source.includes("isAdminAuthenticated")) unguardedAdminRoutes.push(name);
}
assert.deepEqual(unguardedAdminRoutes, [], "Every non-login administrative API route must enforce the admin session.");

const clientFiles = (await filesBelow(".")).filter((path) => /\.(ts|tsx|js|jsx)$/.test(path) && !path.includes("node_modules") && !path.includes(".next"));
const exposedSecretFiles = [];
for (const path of clientFiles) {
  const source = await readFile(path, "utf8");
  if (source.includes('"use client"') && /SUPABASE_SERVICE_ROLE_KEY|PAYSTACK_SECRET_KEY|RESEND_API_KEY|REALMS_ADMIN_PASSWORD/.test(source)) exposedSecretFiles.push(relative(root, path));
}
assert.deepEqual(exposedSecretFiles, [], "Server credentials must never be referenced by client modules.");

const devEmail = await read("app/api/dev/test-email/route.ts");
assert.match(devEmail, /NODE_ENV === "production"/);
assert.match(devEmail, /isAdminAuthenticated/);

const currentEnrollment = await read("lib/lms/currentEnrollment.ts");
for (const status of ["pending_onboarding", "active", "enrolled", "matriculated"]) assert.match(currentEnrollment, new RegExp(`"${status}"`));
assert.match(currentEnrollment, /if \(active\.error \|\| active\.data\) return active/);

const studentContexts = ["portalData.ts", "studentDashboard.ts", "studentLearning.ts", "studentAttendance.ts", "engagementAuth.ts", "engagementData.ts", "resultData.ts", "portalInvite.ts"];
for (const file of studentContexts) assert.match(await read(`lib/lms/${file}`), /selectCurrentStudentEnrollment/, `${file} must use active-first current-enrolment selection.`);

const adminApiSource = (await Promise.all(adminRoutes.map((path) => readFile(path, "utf8")))).join("\n");
assert.doesNotMatch(adminApiSource, /Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/);

const build4 = await read("supabase/lms_build_4_student_portal.sql");
assert.match(build4, /drop policy if exists "authenticated users read course catalogue"/);
assert.match(build4, /current_student_enrolled_in_course/);
const build7 = await read("supabase/lms_build_7_recorded_learning.sql");
assert.match(build7, /add column if not exists requirement_snapshot jsonb not null/);
assert.match(build7, /No authenticated policy is intentionally defined for recording_checkpoint_answer_keys/);

const confirmationSources = await Promise.all([
  read("components/admin/ResultActions.tsx"),
  read("components/admin/Build12Actions.tsx"),
  read("components/admin/EngagementActions.tsx"),
  read("components/admin/AbsenceReviewActions.tsx"),
  read("components/admin/AssignmentRecord.tsx"),
  read("components/admin/QuizRecord.tsx"),
]);
assert.ok(confirmationSources.every((source) => source.includes("window.confirm")), "High-impact administrative interfaces must require an explicit confirmation.");

const publicSourceFiles = [
  ...(await filesBelow("app")).filter((path) => /\.(ts|tsx)$/.test(path)),
  ...(await filesBelow("components")).filter((path) => /\.(ts|tsx)$/.test(path)),
];
const publicSource = (await Promise.all(publicSourceFiles.map((path) => readFile(path, "utf8")))).join("\n");
assert.doesNotMatch(publicSource, /owned and operated by General Revival/i);
assert.doesNotMatch(publicSource, /subsidiary of General Revival/i);

console.log(JSON.stringify({
  adminApiRoutesGuarded: adminRoutes.length - 2,
  clientSecretReferences: 0,
  studentContextsUsingActiveFirstEnrollment: studentContexts.length,
  reviewedMigrationContracts: 2,
  highImpactConfirmationModules: confirmationSources.length,
  passed: 5,
}, null, 2));
