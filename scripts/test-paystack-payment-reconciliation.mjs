import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  hasExpectedPaystackRegistrationSource,
  paymentReferenceMatchesApplication,
  reconcileRegistrationPayment,
} from "../lib/paymentReconciliation.ts";

const exact = reconcileRegistrationPayment({ expectedKobo: 1_500_000, receivedKobo: 1_500_000, expectedCurrency: "NGN", receivedCurrency: "ngn" });
assert.equal(exact.accepted, true);
assert.equal(exact.varianceType, "exact");
assert.equal(exact.varianceKobo, 0);

const overpayment = reconcileRegistrationPayment({ expectedKobo: 1_500_000, receivedKobo: 1_532_995, expectedCurrency: "NGN", receivedCurrency: "NGN" });
assert.equal(overpayment.accepted, true);
assert.equal(overpayment.varianceType, "overpayment");
assert.equal(overpayment.excessKobo, 32_995);

const underpayment = reconcileRegistrationPayment({ expectedKobo: 1_500_000, receivedKobo: 1_499_999, expectedCurrency: "NGN", receivedCurrency: "NGN" });
assert.equal(underpayment.accepted, false);
assert.equal(underpayment.varianceType, "underpayment");
assert.equal(underpayment.shortfallKobo, 1);

const currencyMismatch = reconcileRegistrationPayment({ expectedKobo: 1_500_000, receivedKobo: 1_532_995, expectedCurrency: "NGN", receivedCurrency: "USD" });
assert.equal(currencyMismatch.accepted, false);
assert.equal(currencyMismatch.varianceType, "currency_mismatch");

assert.equal(hasExpectedPaystackRegistrationSource({ source: "realms_august_2026_registration" }), true);
assert.equal(hasExpectedPaystackRegistrationSource({ source: "untrusted_source" }), false);
assert.equal(paymentReferenceMatchesApplication("REALMS-123", "REALMS-123"), true);
assert.equal(paymentReferenceMatchesApplication("REALMS-OTHER", "REALMS-123"), false);

assert.deepEqual(
  reconcileRegistrationPayment({ expectedKobo: 1_500_000, receivedKobo: 1_532_995, expectedCurrency: "NGN", receivedCurrency: "NGN" }),
  overpayment,
  "Repeated reconciliation must be deterministic.",
);

const [verificationRoute, saveRegistration, paymentVerificationAudit, registrationEmails, footer, about, constants] = await Promise.all([
  readFile(new URL("../app/api/paystack/verify/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/saveRegistration.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/paymentVerificationAudit.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/registrationEmails.ts", import.meta.url), "utf8"),
  readFile(new URL("../components/layout/Footer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/about/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/constants.ts", import.meta.url), "utf8"),
]);
assert.match(verificationRoute, /hasExpectedPaystackRegistrationSource/);
assert.match(verificationRoute, /reconciliation\.varianceType === "underpayment"/);
assert.match(verificationRoute, /recordUnconfirmedRegistrationPayment\(transaction, normalized, reconciliation\)/);
assert.match(verificationRoute, /paymentVerificationAuditStatus === "pending"/);
assert.match(saveRegistration, /\.neq\("payment_status", "success"\)/);
assert.match(saveRegistration, /\.eq\("paystack_raw->>id", String\(paystackData\.id\)\)/);
assert.match(saveRegistration, /realms_payment_reconciliation/);
assert.match(paymentVerificationAudit, /event_type: "payment_verified"/);
assert.match(registrationEmails, /realms-registration-\$\{registration\.id\}-\$\{kind\}/);
assert.doesNotMatch(`${footer}\n${about}\n${constants}`, /Powered by (?:Gloryrealm Christian Centre|GRCC)|A GRCC institution/i);

console.log("Paystack payment reconciliation tests passed (exact, overpayment, underpayment, currency, metadata, reference ownership, idempotency guards, recovery classification, and footer copy)." );
