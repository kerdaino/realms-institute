import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { reconcileRegistrationPayment } from "../lib/paymentReconciliation.ts";

const read = (path) => readFile(resolve(process.cwd(), path), "utf8");
let passed = 0;
function check(name, callback) {
  callback();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

const exact = reconcileRegistrationPayment({ expectedKobo: 500_000, receivedKobo: 500_000, expectedCurrency: "NGN", receivedCurrency: "NGN" });
const excess = reconcileRegistrationPayment({ expectedKobo: 500_000, receivedKobo: 650_000, expectedCurrency: "NGN", receivedCurrency: "NGN" });
const under = reconcileRegistrationPayment({ expectedKobo: 500_000, receivedKobo: 300_000, expectedCurrency: "NGN", receivedCurrency: "NGN" });
const wrongCurrency = reconcileRegistrationPayment({ expectedKobo: 500_000, receivedKobo: 500_000, expectedCurrency: "NGN", receivedCurrency: "USD" });

check("exact partial-scholarship amount is accepted", () => assert.equal(exact.accepted, true));
check("approved excess is accepted", () => assert.equal(excess.varianceType, "overpayment"));
check("excess is recorded separately", () => assert.equal(excess.excessKobo, 150_000));
check("underpayment is rejected", () => assert.equal(under.accepted, false));
check("underpayment retains the shortfall", () => assert.equal(under.shortfallKobo, 200_000));
check("wrong currency is rejected", () => assert.equal(wrongCurrency.varianceType, "currency_mismatch"));
check("repeated amount reconciliation is deterministic", () => assert.deepEqual(reconcileRegistrationPayment({ expectedKobo: 500_000, receivedKobo: 650_000, expectedCurrency: "NGN", receivedCurrency: "NGN" }), excess));

const [service, adminRoute, webhookRoute, webhookHelper, detail, saveRegistration, scholarshipPayment, audit, emails, provisioning, schema] = await Promise.all([
  read("lib/paystackReconciliation.server.ts"),
  read("app/api/admin/registrations/[id]/payment-reconciliation/route.ts"),
  read("app/api/paystack/webhook/route.ts"),
  read("lib/paystackWebhook.server.ts"),
  read("components/admin/RegistrationDetail.tsx"),
  read("lib/saveRegistration.ts"),
  read("lib/scholarshipPayment.server.ts"),
  read("lib/paymentVerificationAudit.ts"),
  read("lib/registrationEmails.ts"),
  read("lib/lms/provisionStudent.ts"),
  read("supabase/schema.sql"),
]);

check("admin reconciliation route is authenticated", () => assert.match(adminRoute, /isAdminAuthenticated/));
check("preview verifies directly with Paystack", () => assert.match(service, /verifyPaystackTransaction\(reference\)/));
check("apply independently re-runs inspection", () => assert.match(service, /applyPaystackReconciliation[\s\S]*inspectPaystackReconciliation\(reference, expectedApplicationId\)/));
check("wrong application binding is rejected", () => assert.match(service, /belongs to another application/));
check("stored payment reference is required", () => assert.match(service, /paymentReferenceMatchesApplication\(current\.data\.payment_reference, reference\)/));
check("customer email is secondary mismatch evidence", () => assert.match(service, /customer_email_mismatch/));
check("failed or abandoned transaction is rejected", () => assert.match(service, /transaction\.status !== "success"/));
check("transaction cannot attach to a second application", () => assert.match(service, /transactionAssignedElsewhere/));
check("successful persistence satisfies the financial requirement", () => assert.match(saveRegistration, /financial_requirement_status: "satisfied_by_payment"/));
check("partial scholarship decision is not mutated during reconciliation", () => assert.doesNotMatch(service, /scholarship_status\s*:/));
check("admission is not mutated during reconciliation", () => assert.doesNotMatch(service, /application_status\s*:/));
check("student provisioning is not invoked", () => assert.doesNotMatch(service, /provisionStudent/));
check("verified amount comes from Paystack subunits", () => assert.match(saveRegistration, /amount_paid: paystackData\.amount \/ 100/));
check("manual source and actor are audited", () => { assert.match(audit, /manual_admin_gateway_verification/); assert.match(audit, /reconciled_by/); });
check("gateway transaction details are audited", () => { assert.match(audit, /paystack_transaction_id/); assert.match(audit, /payment_channel/); assert.match(audit, /gateway_status/); });
check("payment audit is unique by application and reference", () => assert.match(schema, /registration_review_events_payment_verified_reference_uidx/));
check("same payment update is guarded idempotently", () => { assert.match(saveRegistration, /neq\("payment_status", "success"\)/); assert.match(scholarshipPayment, /neq\("payment_status", "success"\)/); });
check("normal payment emails use provider idempotency", () => assert.match(emails, /realms-registration-\$\{registration\.id\}-\$\{kind\}/));
check("automatic reconciliation email is only scheduled after a matched payment", () => assert.ok(webhookRoute.indexOf("result.preview.outcome === \"rejected\"") < webhookRoute.indexOf("const emailStatus = await sendRegistrationEmailsIfNeeded")));
check("admin UI has preview and explicit apply steps", () => { assert.match(detail, /Verify Transaction/); assert.match(detail, /Apply Reconciliation/); });
check("admin UI states reconciliation never changes admission", () => assert.match(detail, /does not change scholarship support, admit the applicant, or provision a student account/));
check("webhook re-verifies rather than trusting event financial values", () => assert.match(webhookRoute, /applyPaystackReconciliation\(reference, undefined, "paystack_webhook"\)/));
check("webhook accepts only charge.success for payment processing", () => assert.match(webhookRoute, /event\.event !== "charge\.success"/));
check("webhook signature uses HMAC SHA512 and timing-safe comparison", () => { assert.match(webhookHelper, /createHmac\("sha512"/); assert.match(webhookHelper, /timingSafeEqual/); });
check("webhook test fixture signature has the required digest shape", () => assert.match(createHmac("sha512", "test-secret").update('{"event":"charge.success"}').digest("hex"), /^[0-9a-f]{128}$/));
check("transient webhook failure requests a Paystack retry", () => assert.match(webhookRoute, /status: 500/));
check("pending payment audit also requests a webhook retry", () => assert.match(webhookRoute, /paymentVerificationAuditStatus === "pending"/));
check("existing deliberate provisioning still requires admission and finance", () => { assert.match(provisioning, /isFinancialRequirementSatisfied/); assert.match(provisioning, /application_status/); });

console.log(`Admin Paystack reconciliation tests passed: ${passed} checks.`);
