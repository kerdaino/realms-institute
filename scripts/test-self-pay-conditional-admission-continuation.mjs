import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { hasExpectedPaystackRegistrationSource } from "../lib/paymentReconciliation.ts";
import { registrationFinancialSummary } from "../lib/scholarshipFinance.ts";

const read = (path) => readFile(resolve(process.cwd(), path), "utf8");
const [continuation, continuationPage, continuationRoute, registrationEmails, emailTemplates, adminEmailRoute, adminUi, statusRoute, reconciliation, publicInitialize] = await Promise.all([
  read("lib/paymentContinuation.server.ts"),
  read("app/payment/continue/[token]/page.tsx"),
  read("app/api/paystack/continue/route.ts"),
  read("lib/registrationEmails.ts"),
  read("lib/emailTemplates.ts"),
  read("app/api/admin/registrations/[id]/conditional-admission-email/route.ts"),
  read("components/admin/RegistrationDetail.tsx"),
  read("app/api/admin/registrations/[id]/status/route.ts"),
  read("lib/paymentReconciliation.ts"),
  read("app/api/paystack/initialize/route.ts"),
]);

const selfPay = registrationFinancialSummary({ normalFee: 10_000, currency: "NGN", fundingRoute: "self_pay", scholarshipStatus: "not_requested", approvedScholarshipAmount: null, amountPaid: 0, paymentStatus: "pending", financialRequirementStatus: "payment_required" });
assert.equal(selfPay.valid, true); // 1
assert.equal(selfPay.remainingDue, 10_000); // 2
assert.match(registrationEmails, /createPaymentContinuationLink\(applicationId, "conditional_admission"\)/); // 3
assert.doesNotMatch(registrationEmails, /else if \(registration\.payment_authorization_url\)/); // 4
assert.match(continuation, /createCipheriv\("aes-256-gcm"/); // 5
assert.match(continuation, /registrationId: string;\s+expiresAt: number;/); // 6
assert.doesNotMatch(continuation.slice(continuation.indexOf("type TokenPayload"), continuation.indexOf("type PaymentContinuationRow")), /amount|currency|email/i); // 7
assert.match(continuation, /\.is\("deleted_at", null\)/); // 8
assert.match(continuation, /row\.application_status !== conditionalAdmissionStatus/); // 9
assert.match(continuation, /deadlineValue <= Date\.now\(\)/); // 10
assert.match(continuation, /registrationFinancialSummary/); // 11
assert.match(continuation, /verifyPaystackTransaction\(reference\)/); // 12
assert.match(continuation, /kind: "successful"[\s\S]*\/payment\/verify\?reference=/); // 13
assert.match(continuation, /kind: "reusable"/); // 14
assert.match(continuation, /initializePaystackTransaction/); // 15
assert.match(continuation, /event_type: "payment_reference_reinitialized"/); // 16
assert.match(continuation, /summary\.financialRequirementStatus === "satisfied_by_scholarship" \|\| summary\.remainingDue === 0/); // 17
assert.match(continuationPage, /does not change academic requirements/); // 18
assert.match(continuationRoute, /consumePublicRateLimits/); // 19
assert.match(adminEmailRoute, /sendAdmissionCommunication\(id, "conditional_admission_offer", \{ force: true \}\)/); // 20
assert.match(adminUi, /Send \/ Resend Conditional Admission Email/); // 21
assert.match(statusRoute, /const emailStatus = shouldSendEmail[\s\S]*sendAdmissionCommunication\(id, "conditional_admission_offer"\)/); // 22
assert.equal(hasExpectedPaystackRegistrationSource({ source: "realms_public_registration" }), true); // 23

assert.match(emailTemplates, /\["Registration Fee"/);
assert.match(emailTemplates, /\["Amount Paid"/);
assert.match(emailTemplates, /\["Amount Due"/);
assert.match(reconciliation, /legacyPublicPaystackRegistrationMetadataSource/);
assert.match(publicInitialize, /source: paystackRegistrationMetadataSource/);
assert.match(continuation, /\.eq\("payment_reference", previousReference\)/);

console.log("Self-pay conditional-admission continuation checks passed (23 primary controls plus email, legacy-source and concurrency guards).");
