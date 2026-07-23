import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { isFinancialRequirementSatisfied, scholarshipFinancialSummary } from "../lib/scholarshipFinance.ts";

const read = (path) => readFile(resolve(process.cwd(), path), "utf8");

const partial = scholarshipFinancialSummary({
  normalFee: 10_000,
  scholarshipStatus: "approved_partial",
  approvedScholarshipAmount: 5_000,
  amountPaid: null,
  paymentStatus: "not_paid",
});
assert.equal(partial.valid, true);
assert.equal(partial.approvedSupport, 5_000);
assert.equal(partial.amountDue, 5_000);
assert.equal(partial.financialRequirementStatus, "payment_required");

const paidPartial = scholarshipFinancialSummary({
  normalFee: 10_000,
  scholarshipStatus: "approved_partial",
  approvedScholarshipAmount: 6_000,
  amountPaid: 4_000,
  paymentStatus: "success",
});
assert.equal(paidPartial.amountDue, 4_000);
assert.equal(paidPartial.financialRequirementStatus, "satisfied_by_payment");

const full = scholarshipFinancialSummary({
  normalFee: 10_000,
  scholarshipStatus: "approved_full",
  approvedScholarshipAmount: 10_000,
  amountPaid: null,
  paymentStatus: "not_paid",
});
assert.equal(full.amountDue, 0);
assert.equal(full.financialRequirementStatus, "satisfied_by_scholarship");
assert.equal(isFinancialRequirementSatisfied({
  funding_route: "scholarship_request",
  scholarship_status: "approved_full",
  scholarship_approved_amount: 10_000,
  amount: 10_000,
  amount_paid: null,
  payment_status: "not_paid",
  financial_requirement_status: "satisfied_by_scholarship",
}), true);

const declined = scholarshipFinancialSummary({
  normalFee: 10_000,
  scholarshipStatus: "declined",
  approvedScholarshipAmount: null,
  amountPaid: null,
  paymentStatus: "not_paid",
});
assert.equal(declined.approvedSupport, 0);
assert.equal(declined.amountDue, 10_000);

const invalidPartial = scholarshipFinancialSummary({
  normalFee: 10_000,
  scholarshipStatus: "approved_partial",
  approvedScholarshipAmount: 10_000,
});
assert.equal(invalidPartial.valid, false);
assert.equal(invalidPartial.amountDue, null);

const [
  decisionRoute,
  resendRoute,
  paymentServer,
  initializeRoute,
  verifyRoute,
  emails,
  templates,
  provisioning,
  schema,
] = await Promise.all([
  read("app/api/admin/registrations/[id]/scholarship-review/route.ts"),
  read("app/api/admin/registrations/[id]/scholarship-decision-email/route.ts"),
  read("lib/scholarshipPayment.server.ts"),
  read("app/api/paystack/scholarship/initialize/route.ts"),
  read("app/api/paystack/verify/route.ts"),
  read("lib/registrationEmails.ts"),
  read("lib/emailTemplates.ts"),
  read("lib/lms/provisionStudent.ts"),
  read("supabase/scholarship_decision_payment.sql"),
]);

assert.match(decisionRoute, /sendCurrentScholarshipDecisionEmail/);
assert.ok(decisionRoute.indexOf("update(updates)") < decisionRoute.indexOf("const emailStatus = await sendCurrentScholarshipDecisionEmail"), "Decision must persist before email delivery.");
assert.match(resendRoute, /sendCurrentScholarshipDecisionEmail/);
assert.doesNotMatch(resendRoute, /scholarship_status|scholarship_approved_amount/);

assert.match(paymentServer, /createCipheriv\("aes-256-gcm"/);
assert.match(paymentServer, /expiresAt: Date\.now\(\) \+ tokenLifetimeMs/);
assert.doesNotMatch(paymentServer.slice(paymentServer.indexOf("type TokenPayload"), paymentServer.indexOf("export type ScholarshipPaymentPageState")), /amount|currency/);
assert.match(paymentServer, /scholarshipFinancialSummary/);
assert.match(paymentServer, /payment_expected_amount/);
assert.match(paymentServer, /paymentReferenceMatchesApplication/);
assert.match(paymentServer, /financial_requirement_status: "satisfied_by_payment"/);
assert.match(initializeRoute, /scholarship_payment_source/);
assert.match(initializeRoute, /scholarship_payment_token/);
assert.match(verifyRoute, /reconcileRegistrationPayment/);
assert.match(verifyRoute, /saveVerifiedScholarshipPayment/);

assert.match(emails, /scholarship_decision_email_last_attempted_at/);
assert.match(emails, /scholarship_decision_email_sent/);
assert.match(emails, /scholarship_decision_email_failed/);
assert.match(templates, /Payment confirms the financial part of your application; it does not by itself mean that you have been admitted\./);
assert.match(templates, /no registration payment is required/i);
assert.match(templates, /admissions@mail\.grccglobal\.org/);

assert.match(provisioning, /isFinancialRequirementSatisfied/);
assert.match(schema, /scholarship_approved_amount values retain their established meaning/);
assert.match(schema, /amount - scholarship_approved_amount/);
assert.match(schema, /satisfied_by_scholarship/);
assert.doesNotMatch(schema, /amount_paid\s*=\s*amount/);

console.log("Scholarship decision/payment checks passed (finance, notification, token, Paystack, audit, and provisioning contracts).");
