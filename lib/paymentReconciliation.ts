export const paystackRegistrationMetadataSource = "realms_august_2026_registration";

export type PaymentVarianceType = "exact" | "overpayment" | "underpayment" | "currency_mismatch";

export type PaymentReconciliation = {
  accepted: boolean;
  expectedKobo: number;
  receivedKobo: number;
  expectedCurrency: string;
  receivedCurrency: string;
  varianceType: PaymentVarianceType;
  varianceKobo: number;
  excessKobo: number;
  shortfallKobo: number;
};

function normalizedCurrency(value: string) {
  return value.trim().toUpperCase();
}

export function hasExpectedPaystackRegistrationSource(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  return (metadata as Record<string, unknown>).source === paystackRegistrationMetadataSource;
}

export function paymentReferenceMatchesApplication(savedReference: unknown, verifiedReference: string) {
  return typeof savedReference === "string" && savedReference.trim() === verifiedReference;
}

export function reconcileRegistrationPayment(input: {
  expectedKobo: number;
  receivedKobo: number;
  expectedCurrency: string;
  receivedCurrency: string;
}): PaymentReconciliation {
  const expectedKobo = Math.round(input.expectedKobo);
  const receivedKobo = Math.round(input.receivedKobo);
  if (!Number.isSafeInteger(expectedKobo) || expectedKobo <= 0 || !Number.isSafeInteger(receivedKobo) || receivedKobo < 0) throw new Error("VALID_PAYMENT_AMOUNTS_REQUIRED");
  const expectedCurrency = normalizedCurrency(input.expectedCurrency);
  const receivedCurrency = normalizedCurrency(input.receivedCurrency);
  if (!expectedCurrency || expectedCurrency !== receivedCurrency) {
    return { accepted: false, expectedKobo, receivedKobo, expectedCurrency, receivedCurrency, varianceType: "currency_mismatch", varianceKobo: 0, excessKobo: 0, shortfallKobo: 0 };
  }
  if (receivedKobo < expectedKobo) {
    const shortfallKobo = expectedKobo - receivedKobo;
    return { accepted: false, expectedKobo, receivedKobo, expectedCurrency, receivedCurrency, varianceType: "underpayment", varianceKobo: shortfallKobo, excessKobo: 0, shortfallKobo };
  }
  if (receivedKobo === expectedKobo) {
    return { accepted: true, expectedKobo, receivedKobo, expectedCurrency, receivedCurrency, varianceType: "exact", varianceKobo: 0, excessKobo: 0, shortfallKobo: 0 };
  }
  const excessKobo = receivedKobo - expectedKobo;
  return { accepted: true, expectedKobo, receivedKobo, expectedCurrency, receivedCurrency, varianceType: "overpayment", varianceKobo: excessKobo, excessKobo, shortfallKobo: 0 };
}
