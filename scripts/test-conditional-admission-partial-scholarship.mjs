import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { isFinancialRequirementSatisfied, registrationFinancialSummary } from "../lib/scholarshipFinance.ts";

const read = (path) => readFile(resolve(process.cwd(), path), "utf8");
const eligibleRecord = {
  currency: "NGN",
  fundingRoute: "scholarship_request",
  scholarshipStatus: "approved_partial",
  approvedScholarshipAmount: 5_000,
  normalFee: 15_000,
  amountPaid: 0,
  paymentStatus: "not_paid",
  financialRequirementStatus: "payment_required",
};

const partial = registrationFinancialSummary(eligibleRecord);
assert.equal(partial.valid, true);
assert.equal(partial.normalFee, 15_000);
assert.equal(partial.approvedSupport, 5_000);
assert.equal(partial.amountDue, 10_000);
assert.equal(partial.remainingDue, 10_000);
assert.equal(partial.financialRequirementStatus, "payment_required");

const selfPay = registrationFinancialSummary({
  normalFee: 15_000,
  currency: "NGN",
  fundingRoute: "self_pay",
  scholarshipStatus: "not_requested",
  approvedScholarshipAmount: null,
  amountPaid: 0,
  paymentStatus: "not_paid",
  financialRequirementStatus: "payment_required",
});
assert.equal(selfPay.valid, true);
assert.equal(selfPay.remainingDue, 15_000);

const full = registrationFinancialSummary({
  ...eligibleRecord,
  scholarshipStatus: "approved_full",
  approvedScholarshipAmount: 15_000,
  financialRequirementStatus: "satisfied_by_scholarship",
});
assert.equal(full.valid, true);
assert.equal(full.amountDue, 0);
assert.equal(full.remainingDue, 0);
assert.equal(full.financialRequirementStatus, "satisfied_by_scholarship");

const paidPartial = registrationFinancialSummary({
  ...eligibleRecord,
  amountPaid: 10_000,
  paymentStatus: "success",
  financialRequirementStatus: "satisfied_by_payment",
});
assert.equal(paidPartial.valid, true);
assert.equal(paidPartial.remainingDue, 0);
assert.equal(isFinancialRequirementSatisfied({
  amount: 15_000,
  currency: "NGN",
  funding_route: "scholarship_request",
  scholarship_status: "approved_partial",
  scholarship_approved_amount: 5_000,
  amount_paid: 10_000,
  payment_status: "success",
  financial_requirement_status: "satisfied_by_payment",
}), true);

const underpayment = registrationFinancialSummary({
  ...eligibleRecord,
  amountPaid: 4_000,
  paymentStatus: "underpayment",
});
assert.equal(underpayment.valid, true);
assert.equal(underpayment.amountDue, 10_000);
assert.equal(underpayment.remainingDue, 6_000);
assert.equal(underpayment.requiresManualPaymentReview, true);

for (const inconsistent of [
  registrationFinancialSummary({ ...eligibleRecord, approvedScholarshipAmount: null }),
  registrationFinancialSummary({ ...eligibleRecord, approvedScholarshipAmount: 16_000 }),
  registrationFinancialSummary({ ...eligibleRecord, normalFee: 0 }),
  registrationFinancialSummary({ ...eligibleRecord, currency: "USD" }),
  registrationFinancialSummary({ ...eligibleRecord, financialRequirementStatus: "satisfied_by_payment" }),
]) {
  assert.equal(inconsistent.valid, false);
  assert.equal(inconsistent.remainingDue, null);
}

const [conditionalAdmission, statusRoute, adminRegistrations, paymentServer, emailTemplates, registrationEmails, provisioning] = await Promise.all([
  read("lib/conditionalAdmission.ts"),
  read("app/api/admin/registrations/[id]/status/route.ts"),
  read("lib/adminRegistrations.ts"),
  read("lib/scholarshipPayment.server.ts"),
  read("lib/emailTemplates.ts"),
  read("lib/registrationEmails.ts"),
  read("lib/lms/provisionStudent.ts"),
]);

assert.match(adminRegistrations, /scholarship_status, scholarship_approved_amount, admin_note/);
assert.match(conditionalAdmission, /registrationFinancialSummary/);
assert.match(conditionalAdmission, /outstandingAmount: summary\.remainingDue/);
assert.match(conditionalAdmission, /requiresManualPaymentReview/);
assert.match(statusRoute, /admission_outstanding_amount: existingOffer \? current\.admission_outstanding_amount : eligibility\.outstandingAmount/);
assert.match(statusRoute, /paymentDeadlineFromOffer\(decisionAt\)/);
assert.match(statusRoute, /financial requirement is still outstanding/i);
assert.doesNotMatch(statusRoute, /scholarship_status\s*:/);
assert.match(paymentServer, /registrationFinancialSummary/);
assert.match(paymentServer, /fee: \{ amount: summary\.remainingDue, currency: row\.currency \}/);
assert.doesNotMatch(paymentServer.slice(paymentServer.indexOf("type TokenPayload"), paymentServer.indexOf("export type ScholarshipPaymentPageState")), /amount|currency/);
assert.match(registrationEmails, /current amount due differs from the historical outstanding-at-offer snapshot/i);
assert.match(emailTemplates, /\["Registration Fee"/);
assert.match(emailTemplates, /\["Scholarship Support"/);
assert.match(emailTemplates, /\["Amount Paid"/);
assert.match(emailTemplates, /\["Amount Due"/);
assert.match(emailTemplates, /admission will be confirmed after verified payment satisfies the financial requirement/i);
assert.match(provisioning, /application_status !== "admitted"/);
assert.match(provisioning, /isFinancialRequirementSatisfied/);

console.log("Conditional-admission partial-scholarship checks passed (canonical finance, offer snapshot, email, payment, and decision boundaries).")
