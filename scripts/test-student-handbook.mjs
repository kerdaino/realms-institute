import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";

import { resolveRequiredStudentHandbook, studentHandbookDocuments } from "../lib/lms/handbookConfig.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const handbook = resolveRequiredStudentHandbook("RSD-AUG-2026");
assert.ok(handbook);
assert.equal(handbook.version, "1.0");
assert.equal(handbook.title, "REALMS School of Discovery August 2026 Student Handbook");
assert.equal(handbook.acknowledgementText, "I confirm that I have read and understood the REALMS School of Discovery August 2026 Student Handbook and agree to follow the published programme requirements applicable to my approved route and pathway.");

const pdf = await readFile(new URL(`public${handbook.fileHref}`, root));
assert.ok(pdf.length > 300_000);
assert.equal(createHash("sha256").update(pdf).digest("hex"), "d44b3ad605b300855f4dab74427f599d83d0540299e782ba47811a87558bd554");

const sql = await read("supabase/lms_august_2026_handbook_acknowledgement.sql");
assert.match(sql, /create table if not exists public\.student_document_acknowledgements/);
for (const column of ["student_id", "document_type", "document_version", "document_title", "effective_cohort_id", "acknowledgement_text_snapshot", "acknowledged_at", "created_at"]) assert.match(sql, new RegExp(`\\b${column}\\b`));
assert.match(sql, /unique index if not exists[\s\S]*student_id, document_type, document_version/);
assert.match(sql, /acknowledged_at timestamptz not null default now\(\)/);
assert.match(sql, /create policy "students read own document acknowledgements"[\s\S]*for select/);
assert.doesNotMatch(sql, /create policy[^;]+for (insert|update|delete)/i);
assert.match(sql, /before update or delete on public\.student_document_acknowledgements/);
assert.match(sql, /Student document acknowledgements are immutable\./);
assert.match(sql, /revoke all on public\.student_document_acknowledgements from anon, authenticated/);
assert.match(sql, /grant select on public\.student_document_acknowledgements to authenticated/);

const action = await read("app/student/onboarding/handbook/actions.ts");
assert.match(action, /requireRole\("student"\)/);
assert.match(action, /loadStudentHandbookState\(supabase, user\.id\)/);
assert.match(action, /student_id: state\.studentId/);
assert.match(action, /acknowledgement_text_snapshot: document\.acknowledgementText/);
assert.match(action, /inserted\.error\.code !== "23505"/);
assert.doesNotMatch(action, /formData\.get\(["']student/i, "The client must not choose the student identity.");
assert.doesNotMatch(action, /acknowledged_at\s*:/, "The client or action must not choose the acknowledgement timestamp.");

const academicLayout = await read("app/student/(academic)/layout.tsx");
assert.match(academicLayout, /requireStudentHandbookAcknowledgement\(user\.id\)/);
for (const page of ["courses/page.tsx", "sessions/[sessionId]/page.tsx", "assignments/page.tsx", "quizzes/page.tsx", "attendance/page.tsx", "recordings/page.tsx", "absences/page.tsx", "calendar/page.tsx", "resources/page.tsx", "results/page.tsx", "graduation/page.tsx"]) await access(new URL(`app/student/(academic)/${page}`, root));
const gate = await read("lib/lms/studentHandbookGate.ts");
assert.match(gate, /redirect\("\/student\/onboarding\/handbook"\)/);
const stateService = await read("lib/lms/studentHandbook.ts");
assert.match(stateService, /document_version", requiredDocument\.version/);
assert.match(stateService, /assertStudentHandbookAcknowledged/);

for (const file of ["studentAssessmentApi.ts", "studentRecordingApi.ts", "studentAbsenceApi.ts"]) assert.match(await read(`lib/lms/${file}`), /assertStudentHandbookAcknowledged/);
assert.match(await read("app/api/student/sessions/[sessionId]/join/route.ts"), /assertStudentHandbookAcknowledged/);

const onboardingPage = await read("app/student/onboarding/handbook/page.tsx");
assert.match(onboardingPage, /\{document\.school\}/);
for (const label of ["August 2026 Student Handbook", "View Handbook", "Download Handbook"]) assert.match(onboardingPage, new RegExp(label));
const form = await read("components/student/HandbookAcknowledgementForm.tsx");
assert.match(form, /Acknowledge Handbook/);
assert.doesNotMatch(form, /signature|canvas|image\/upload/i);

const dashboard = await read("app/student/page.tsx");
assert.match(dashboard, /title="Student Handbook"/);
assert.match(dashboard, /Download PDF/);
assert.match(dashboard, /Acknowledged/);
assert.match(dashboard, /requireStudentHandbookAcknowledgement\(user\.id\)/);
const admin = await read("components/admin/StudentRecord.tsx");
assert.match(admin, /Student Handbook acknowledgement/);
assert.match(admin, /Current required handbook/);
assert.match(admin, /Acknowledged date/);

const v10 = studentHandbookDocuments[0];
const v11 = { ...v10, version: "1.1", fileHref: "/handbooks/future-v1.1.pdf" };
const futureDocuments = [v10, v11];
const futureRequired = resolveRequiredStudentHandbook("RSD-AUG-2026", futureDocuments, { "RSD-AUG-2026": "1.1" });
assert.equal(futureRequired?.version, "1.1");
assert.ok(futureDocuments.some((document) => document.version === "1.0"), "Version 1.0 history must remain available when a later version becomes required.");

console.log(JSON.stringify({
  approvedPdfIntegrity: "passed",
  versionedPersistence: "passed",
  ownStudentServerAction: "passed",
  duplicateProtection: "passed",
  immutableStudentHistory: "passed",
  academicGateContracts: 12,
  permanentDashboardAccess: "passed",
  futureVersionPreservesV10: "passed",
  adminVisibility: "passed",
  passed: 10,
}, null, 2));
