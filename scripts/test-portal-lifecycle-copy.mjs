import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deriveStudentLifecycle } from "../lib/lms/studentLifecycle.ts";

const activeMilestones = {
  portalAccountStatus: "active",
  handbookRequired: true,
  handbookAcknowledged: true,
  orientationCompletedAt: "2026-08-21T09:00:00.000Z",
  matriculatedAt: "2026-08-21T12:00:00.000Z",
};

const admitted = deriveStudentLifecycle({
  studentStatus: "pending_onboarding",
  enrollmentStatus: "pending_onboarding",
  onboardingStatus: "not_started",
  portalAccountStatus: "active",
});
assert.equal(admitted.academicStatus, "Onboarding Pending");
assert.equal(admitted.overallOnboarding, "Onboarding Pending");

const inProgress = deriveStudentLifecycle({
  studentStatus: "active",
  enrollmentStatus: "pending_onboarding",
  onboardingStatus: "in_progress",
  portalAccountStatus: "active",
});
assert.equal(inProgress.academicStatus, "Active Student · Onboarding In Progress");

const orientationPending = deriveStudentLifecycle({
  studentStatus: "active",
  enrollmentStatus: "pending_onboarding",
  onboardingStatus: "completed",
  portalAccountStatus: "active",
  handbookRequired: true,
  handbookAcknowledged: true,
});
assert.equal(orientationPending.academicStatus, "Active Student · Orientation Pending");

const matriculationPending = deriveStudentLifecycle({
  studentStatus: "active",
  enrollmentStatus: "pending_onboarding",
  onboardingStatus: "completed",
  portalAccountStatus: "active",
  handbookRequired: true,
  handbookAcknowledged: true,
  orientationCompletedAt: activeMilestones.orientationCompletedAt,
});
assert.equal(matriculationPending.academicStatus, "Active Student · Matriculation Pending");

const completed = deriveStudentLifecycle({
  studentStatus: "active",
  enrollmentStatus: "pending_onboarding",
  onboardingStatus: "completed",
  ...activeMilestones,
});
assert.equal(completed.academicStatus, "Active Student");
assert.equal(completed.overallOnboarding, "Completed");
assert.equal(completed.portalAccess, "Active");
assert.equal(completed.orientation, "Completed");
assert.equal(completed.matriculation, "Completed");
assert.doesNotMatch(completed.academicStatus, /Pending Onboarding|Onboarding Pending/);

const withdrawn = deriveStudentLifecycle({
  studentStatus: "withdrawn",
  enrollmentStatus: "withdrawn",
  onboardingStatus: "completed",
  ...activeMilestones,
});
assert.equal(withdrawn.academicStatus, "Withdrawn");

const handbookPending = deriveStudentLifecycle({
  studentStatus: "active",
  enrollmentStatus: "active",
  onboardingStatus: "completed",
  portalAccountStatus: "active",
  handbookRequired: true,
  handbookAcknowledged: false,
  orientationCompletedAt: activeMilestones.orientationCompletedAt,
  matriculatedAt: activeMilestones.matriculatedAt,
});
assert.equal(handbookPending.academicStatus, "Active Student · Handbook Acknowledgement Pending");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeTargets = [
  "app/student",
  "app/facilitator",
  "app/admin",
  "app/api/student",
  "app/api/facilitator",
  "components/student",
  "components/attendance",
  "components/portal",
  "components/admin",
];
const allowedExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);

async function sourceFiles(target) {
  const absolute = path.join(root, target);
  const details = await stat(absolute);
  if (details.isFile()) return allowedExtensions.has(path.extname(absolute)) ? [absolute] : [];
  const entries = await readdir(absolute, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => sourceFiles(path.join(target, entry.name))))).flat();
}

const forbidden = [
  /\bBuild (?:[1-9]|1[0-3])\b/i,
  /\bNEXT [1-6]\b/i,
  /\bmigration\b/i,
  /\bfixture\b/i,
  /\bRLS\b/,
  /\bRPC\b/,
  /\bservice role\b/i,
  /\btest-only\b/i,
  /\binternal engine\b/i,
  /\bresult engine\b/i,
  /\bfeature build\b/i,
  /\bproduction implementation pending\b/i,
];
const knownLeaks = [
  "Programme completion requirements are still being configured for your cohort.",
  "Final graduation confirmation, alumni conversion, and certificate access belong to",
  "No watch history is tracked in this build.",
  "Not yet available in the portal; Build",
];

const violations = [];
for (const file of (await Promise.all(runtimeTargets.map(sourceFiles))).flat()) {
  const source = await readFile(file, "utf8");
  for (const pattern of forbidden) if (pattern.test(source)) violations.push(`${path.relative(root, file)}: ${pattern}`);
  for (const phrase of knownLeaks) if (source.includes(phrase)) violations.push(`${path.relative(root, file)}: ${phrase}`);
}
assert.deepEqual(violations, [], `Production-facing copy violations:\n${violations.join("\n")}`);

const sessionsManagerSource = await readFile(path.join(root, "components/admin/SessionsManager.tsx"), "utf8");
const sessionColumns = sessionsManagerSource.match(/const sessionTableColumns = \[([\s\S]*?)\] as const;/);
assert.ok(sessionColumns, "Session table must define stable column identities.");
const sessionColumnKeys = [...sessionColumns[1].matchAll(/key: "([^"]+)"/g)].map((match) => match[1]);
assert.ok(sessionColumnKeys.length > 0, "Session table column identities were not found.");
assert.equal(new Set(sessionColumnKeys).size, sessionColumnKeys.length, "Session table column identities must be unique.");
assert.match(sessionsManagerSource, /sessionTableColumns\.map\(\(column\) => <th key=\{column\.key\}/);

console.log("Student lifecycle, stable session keys, and production portal copy tests passed.");
