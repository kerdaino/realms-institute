import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [
  decisionRoute,
  resendRoute,
  emails,
  templates,
  detail,
  schema,
  migration,
  scholarshipRoute,
  admissionRoute,
] = await Promise.all([
  read("app/api/admin/registrations/[id]/screening-review/route.ts"),
  read("app/api/admin/registrations/[id]/advanced-entry-decision-email/route.ts"),
  read("lib/registrationEmails.ts"),
  read("lib/emailTemplates.ts"),
  read("components/admin/RegistrationDetail.tsx"),
  read("supabase/schema.sql"),
  read("supabase/advanced_entry_decision_email.sql"),
  read("app/api/admin/registrations/[id]/scholarship-review/route.ts"),
  read("app/api/admin/registrations/[id]/status/route.ts"),
]);

const advancedTemplateStart = templates.indexOf("export function createAdvancedEntryOutcomeEmail");
const advancedTemplateEnd = templates.indexOf("export function createScholarshipOutcomeEmail");
const advancedTemplate = templates.slice(advancedTemplateStart, advancedTemplateEnd);
const decisionUpdateStart = decisionRoute.indexOf("const updates:");
const decisionUpdateEnd = decisionRoute.indexOf("const { data, error }");
const decisionUpdates = decisionRoute.slice(decisionUpdateStart, decisionUpdateEnd);
const resendHandler = resendRoute.slice(resendRoute.indexOf("export async function POST"));
let checks = 0;
function check(name, assertion) {
  assertion();
  checks += 1;
  console.log(`ok ${checks} - ${name}`);
}

check("advanced approval saves the advanced route decision", () => {
  assert.match(decisionUpdates, /advanced_entry_status: "advanced_approved"/);
  assert.match(decisionUpdates, /assigned_discipleship_route: "advanced"/);
});

check("advanced approval does not admit the applicant", () => {
  assert.doesNotMatch(decisionUpdates, /application_status|admitted/);
  assert.match(decisionRoute, /Admission status was not changed/);
});

check("advanced approval email contains the approved route", () => {
  assert.match(advancedTemplate, /approved for the Advanced Discipleship Programme/);
  assert.match(advancedTemplate, /\["Approved Route", "Advanced Discipleship Programme"\]/);
});

check("foundational placement leaves the application under consideration", () => {
  assert.match(advancedTemplate, /Your application to REALMS remains under consideration/);
  assert.doesNotMatch(advancedTemplate, /reject(?:ed|ion)|academically weak/i);
});

check("foundational placement email contains the assigned route", () => {
  assert.match(advancedTemplate, /\["Assigned Route", "Foundational Discipleship Programme"\]/);
});

check("more-information decision requires an applicant-safe message", () => {
  assert.match(decisionRoute, /action === "request_more_information" && !applicantMessage/);
  assert.match(emails, /decision === "more_information_required" && !registration\.advanced_entry_applicant_message\?\.trim\(\)/);
});

check("internal screening notes are never supplied to the email template", () => {
  assert.doesNotMatch(advancedTemplate, /screening_review_note|reviewNote|screening score|answer key/i);
  assert.match(decisionRoute, /advanced_entry_applicant_message: action === "request_more_information" \? applicantMessage : null/);
});

check("decision persistence happens before delivery and survives email failure", () => {
  assert.ok(decisionRoute.indexOf("update(updates)") < decisionRoute.indexOf("sendCurrentAdvancedEntryDecisionEmail(id)"));
  assert.match(decisionRoute, /decision saved, but the applicant notification could not be delivered/);
});

check("an existing saved decision can be sent retrospectively", () => {
  assert.match(resendHandler, /sendCurrentAdvancedEntryDecisionEmail\(id\)/);
  assert.match(emails, /Save an advanced-entry decision before sending its notification/);
});

check("resend does not duplicate or change the saved decision", () => {
  assert.doesNotMatch(resendHandler, /screening_|advanced_entry_status|assigned_discipleship_route|application_status/);
  assert.match(resendRoute, /No route, scholarship, payment or admission decision was changed/);
});

check("a changed decision is shown as not yet communicated", () => {
  assert.match(detail, /advanced_entry_decision_email_type === registration\.advanced_entry_status/);
  assert.doesNotMatch(decisionUpdates, /advanced_entry_decision_email_(?:sent|sent_at|type)/);
});

check("advanced-entry decision does not alter scholarship", () => {
  assert.doesNotMatch(decisionUpdates, /scholarship/);
  assert.match(advancedTemplate, /It does not approve scholarship support/);
});

check("advanced-entry decision does not alter payment", () => {
  assert.doesNotMatch(decisionUpdates, /payment/);
  assert.match(advancedTemplate, /change any payment requirement/);
});

check("advanced-entry decision does not provision a student account", () => {
  assert.doesNotMatch(decisionRoute, /students|provisionStudent|student_enrollments/);
  assert.doesNotMatch(resendRoute, /students|provisionStudent|student_enrollments/);
});

check("email audit status and append-only delivery history are preserved", () => {
  assert.match(emails, /advanced_entry_decision_email_sent/);
  assert.match(emails, /advanced_entry_decision_email_failed/);
  assert.match(emails, /registration_review_events/);
  assert.match(detail, /advanced_entry_decision_email_last_attempt_type === registration\.advanced_entry_status/);
  assert.match(schema, /advanced_entry_decision_email_last_attempt_type/);
  assert.doesNotMatch(migration, /delete from|truncate/i);
});

check("scholarship decision notification remains independently wired", () => {
  assert.match(scholarshipRoute, /sendCurrentScholarshipDecisionEmail/);
  assert.doesNotMatch(decisionUpdates, /scholarship_decision_email/);
});

check("admission email remains a separately authorised action", () => {
  assert.match(admissionRoute, /sendApplicationStatusEmail/);
  assert.match(admissionRoute, /sendEmail/);
  assert.doesNotMatch(decisionUpdates, /application_status/);
});

check("decision and resend endpoints retain admin authentication", () => {
  assert.match(decisionRoute, /isAdminAuthenticated/);
  assert.match(resendRoute, /isAdminAuthenticated/);
  assert.match(decisionRoute, /Unauthorized/);
  assert.match(resendRoute, /Unauthorized/);
});

assert.equal(checks, 18);
console.log("Advanced-entry decision notification checks passed (18 scenarios).");
