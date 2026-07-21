import assert from "node:assert/strict";

import {
  buildPaymentVerificationAuditPayload,
  databaseErrorForServerLog,
  recordPaymentVerificationEvent,
} from "../lib/paymentVerificationAudit.ts";

const input = {
  registrationId: "ee9c6937-7432-4480-acff-e0e82b11283a",
  reference: "REALMS-private-payment-reference",
  previousStatus: "pending",
  reconciliation: {
    accepted: true,
    expectedKobo: 1_500_000,
    receivedKobo: 1_532_995,
    expectedCurrency: "NGN",
    receivedCurrency: "NGN",
    varianceType: "overpayment",
    varianceKobo: 32_995,
    excessKobo: 32_995,
    shortfallKobo: 0,
  },
};

function auditClient({ lookups, inserts }) {
  const insertedPayloads = [];
  let lookupIndex = 0;
  let insertIndex = 0;

  return {
    insertedPayloads,
    from(table) {
      assert.equal(table, "registration_review_events");
      return {
        select() {
          const builder = {
            eq() { return builder; },
            contains() { return builder; },
            limit() { return builder; },
            async maybeSingle() {
              const result = lookups[lookupIndex];
              lookupIndex += 1;
              return result;
            },
          };
          return builder;
        },
        async insert(payload) {
          insertedPayloads.push(payload);
          const result = inserts[insertIndex];
          insertIndex += 1;
          return result;
        },
      };
    },
  };
}

const payload = buildPaymentVerificationAuditPayload(input);
assert.equal(payload.event_type, "payment_verified");
assert.equal(payload.new_state.expected_amount_kobo, 1_500_000);
assert.equal(payload.new_state.amount_paid_kobo, 1_532_995);
assert.equal(payload.new_state.payment_variance_kobo, 32_995);
assert.equal(payload.note, "Excess payment recorded for reconciliation.");

const existingAudit = auditClient({ lookups: [{ data: { id: "existing" }, error: null }], inserts: [] });
assert.equal(await recordPaymentVerificationEvent(existingAudit, input), "reused");
assert.equal(existingAudit.insertedPayloads.length, 0, "A retry must reuse the existing audit event.");

const missingAudit = auditClient({ lookups: [{ data: null, error: null }], inserts: [{ error: null }] });
assert.equal(await recordPaymentVerificationEvent(missingAudit, input), "recorded");
assert.deepEqual(missingAudit.insertedPayloads, [payload], "An already-verified registration with a missing audit must be repaired.");

const concurrentAudit = auditClient({
  lookups: [{ data: null, error: null }, { data: { id: "concurrent" }, error: null }],
  inserts: [{ error: { code: "23505", message: "duplicate key" } }],
});
assert.equal(await recordPaymentVerificationEvent(concurrentAudit, input), "reused", "A concurrent retry must not create a duplicate audit.");

const rawDetails = `Failing row contains (${input.registrationId}, ${input.reference}).`;
const safeError = databaseErrorForServerLog({ code: "23502", message: "null review_type", hint: null, details: rawDetails }, [input.registrationId, input.reference]);
assert.equal(safeError.code, "23502");
assert.doesNotMatch(JSON.stringify(safeError), new RegExp(input.registrationId));
assert.doesNotMatch(JSON.stringify(safeError), new RegExp(input.reference));

const originalConsoleError = console.error;
const logged = [];
console.error = (...values) => logged.push(values);
try {
  const malformedAudit = auditClient({
    lookups: [{ data: null, error: null }],
    inserts: [{ error: { code: "23502", message: "null value in review_type", hint: null, details: rawDetails } }],
  });
  assert.equal(await recordPaymentVerificationEvent(malformedAudit, input), "pending");
} finally {
  console.error = originalConsoleError;
}
assert.equal(logged.length, 1);
assert.equal(logged[0][1].code, "23502");
assert.doesNotMatch(JSON.stringify(logged), new RegExp(input.registrationId));
assert.doesNotMatch(JSON.stringify(logged), new RegExp(input.reference));

console.log("Payment verification audit tests passed (payload, existing audit reuse, missing audit repair, concurrent retry, malformed insert handling, and safe database error logging).");
