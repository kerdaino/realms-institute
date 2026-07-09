import "server-only";

import type { CohortFee } from "@/lib/registration";

type InitializeParams = {
  email: string;
  fee: CohortFee;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
};

type PaystackEnvelope<T> = {
  status: boolean;
  message: string;
  data: T;
};

export type PaystackVerificationData = {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at?: string | null;
  paidAt?: string | null;
  customer?: unknown;
  metadata?: Record<string, unknown> | null;
};

function paystackSecretKey() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new Error("PAYSTACK_CONFIGURATION_MISSING");
  return secretKey;
}

async function readPaystackResponse<T>(response: Response) {
  const result = await response.json() as PaystackEnvelope<T>;
  if (!response.ok || !result.status || !result.data) throw new Error(result.message || "Paystack request failed.");
  return result.data;
}

export async function initializePaystackTransaction(params: InitializeParams) {
  const payload: Record<string, unknown> = {
    email: params.email,
    amount: params.fee.amount * 100,
    currency: params.fee.currency,
    reference: params.reference,
    callback_url: params.callbackUrl,
    metadata: params.metadata,
  };

  if (process.env.PAYSTACK_REALMS_SUBACCOUNT) payload.subaccount = process.env.PAYSTACK_REALMS_SUBACCOUNT;

  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${paystackSecretKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  return readPaystackResponse<{ authorization_url: string; access_code: string; reference: string }>(response);
}

export async function verifyPaystackTransaction(reference: string) {
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${paystackSecretKey()}`, "Content-Type": "application/json" },
    cache: "no-store",
  });

  return readPaystackResponse<PaystackVerificationData>(response);
}
