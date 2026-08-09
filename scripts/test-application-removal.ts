import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// @ts-expect-error Node's type-stripping runner requires the explicit extension.
import { applicationDeletionReasons, currentAdmissionsCohortCode, duplicateApplicationMessage, normalizeApplicantEmail, validateApplicationRemoval } from "../lib/applicationLifecycle.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const checks: Array<[string, () => void]> = [];
const check = (name: string, callback: () => void) => checks.push([name, callback]);

const migration = read("supabase/application_soft_delete.sql");
const lifecycle = read("lib/applicationLifecycle.ts");
const adminQueries = read("lib/adminRegistrations.ts");
const dashboard = read("lib/lms/adminData.ts");
const scholarshipQueue = read("app/api/admin/scholarships/route.ts");
const detail = read("components/admin/RegistrationDetail.tsx");
const list = read("components/admin/RegistrationsManager.tsx");
const removalRoute = read("app/api/admin/registrations/[id]/removal/route.ts");
const restoreRoute = read("app/api/admin/registrations/[id]/restore/route.ts");
const emails = read("lib/registrationEmails.ts");
const provisioning = read("lib/lms/provisionStudent.ts");
const registrationSave = read("lib/saveRegistration.ts");

check("all seven controlled deletion reasons are present", () => assert.equal(applicationDeletionReasons.length, 7));
check("deletion reason is required", () => assert.equal(validateApplicationRemoval({ confirmation: "DELETE", reason: "", note: "", supersededByApplicationId: null }).success, false));
check("typed DELETE confirmation is required", () => assert.equal(validateApplicationRemoval({ confirmation: "delete", reason: "test_application", note: "", supersededByApplicationId: null }).success, false));
check("Other requires an administrative note", () => assert.equal(validateApplicationRemoval({ confirmation: "DELETE", reason: "other", note: "", supersededByApplicationId: null }).success, false));
check("duplicate may reference a surviving application", () => assert.equal(validateApplicationRemoval({ confirmation: "DELETE", reason: "duplicate_application", note: "", supersededByApplicationId: "11111111-1111-4111-8111-111111111111" }).success, true));
check("unrelated reasons cannot record a superseding application", () => assert.equal(validateApplicationRemoval({ confirmation: "DELETE", reason: "test_application", note: "", supersededByApplicationId: "11111111-1111-4111-8111-111111111111" }).success, false));
check("current cohort identity is explicit", () => assert.equal(currentAdmissionsCohortCode, "RSD-AUG-2026"));
check("applicant email normalization is deterministic", () => assert.equal(normalizeApplicantEmail(" John@Example.COM "), "john@example.com"));
check("public duplicate response reveals no private application state", () => {
  assert.match(duplicateApplicationMessage, /application for this email already exists/i);
  assert.doesNotMatch(duplicateApplicationMessage, /scholarship|payment|admission status/i);
});
check("migration never hard deletes an application", () => assert.doesNotMatch(migration, /delete\s+from\s+public\.registrations/i));
check("soft delete preserves payment columns", () => assert.doesNotMatch(migration, /set[\s\S]{0,300}(amount_paid|payment_reference|payment_status)\s*=/i));
check("soft delete preserves decision and email columns", () => assert.doesNotMatch(migration, /set[\s\S]{0,300}(scholarship_status|advanced_entry_status|application_status|admission_email_sent)\s*=/i));
check("deletion and restoration create audit events", () => {
  assert.match(migration, /'application_deleted'/);
  assert.match(migration, /'application_restored'/);
});
check("soft delete and audit insert are one database function", () => assert.match(removalRoute, /rpc\("soft_delete_registration"/));
check("restore and audit insert are one database function", () => assert.match(restoreRoute, /rpc\("restore_registration"/));
check("default applications query excludes deleted records", () => assert.match(adminQueries, /filters\.recordScope !== "all"[\s\S]*\.is\("deleted_at", null\)/));
check("deleted and all application filters are supported", () => {
  assert.match(adminQueries, /recordScope === "deleted"/);
  assert.match(list, /Deleted \/ Archived/);
});
check("dashboard application counts exclude deleted records", () => assert.match(dashboard, /from\("registrations"\)[^;]+\.is\("deleted_at", null\)/));
check("scholarship queue excludes deleted records", () => assert.match(scholarshipQueue, /\.is\("deleted_at", null\)/));
check("deleted applications are blocked from email claims", () => {
  assert.match(emails, /Deleted applications cannot receive new communications/);
  assert.ok((emails.match(/\.is\("deleted_at", null\)/g) ?? []).length >= 2);
});
check("student provisioning excludes deleted applications", () => assert.match(provisioning, /\.is\("deleted_at", null\)/));
check("deleted detail is read-only apart from notes and restore", () => {
  assert.match(detail, /if \(registration\.deleted_at\)/);
  assert.match(detail, /Restore Application/);
  assert.match(detail, /Save Admin Note/);
});
check("danger zone displays all required confirmation facts", () => {
  for (const label of ["Applicant", "Email", "Application Date", "Payment Status", "Scholarship Status", "Advanced-entry Status", "Admission Status"]) assert.match(detail, new RegExp(label));
});
check("payment and student preservation warnings are present", () => {
  assert.match(detail, /does not alter or refund the financial transaction/);
  assert.match(detail, /does not delete or withdraw the existing student record/);
});
check("duplicate candidate must share cohort and normalized email", () => assert.match(migration, /survivor\.cohort_code <> target\.cohort_code[\s\S]*lower\(btrim\(survivor\.email\)\)/));
check("database guard permits distinct cohorts", () => assert.match(migration, /existing\.cohort_code = new\.cohort_code/));
check("submission path performs an active cohort-email duplicate check", () => {
  assert.match(registrationSave, /\.eq\("cohort_code", currentAdmissionsCohortCode\)/);
  assert.match(registrationSave, /\.is\("deleted_at", null\)/);
});
check("restore does not send email or repeat a decision", () => {
  assert.doesNotMatch(restoreRoute, /registrationEmails|sendApplicationStatusEmail|sendCurrent(?:Scholarship|AdvancedEntry)/);
  assert.match(migration, /No email or decision was repeated/);
});
check("admin routes remain authenticated", () => {
  assert.match(removalRoute, /isAdminAuthenticated/);
  assert.match(restoreRoute, /isAdminAuthenticated/);
});
check("lifecycle source retains the applicant-safe duplicate wording", () => assert.match(lifecycle, /contact REALMS Admissions for assistance/));

for (const [name, callback] of checks) {
  callback();
  console.log(`PASS ${name}`);
}
console.log(`Application removal checks passed: ${checks.length}`);
