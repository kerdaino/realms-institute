import type { Metadata } from "next";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { PaymentVerification } from "@/components/payment/PaymentVerification";

export const metadata: Metadata = { title: "Payment Verification | REALMS Institute" };

type VerifySearchParams = Record<string, string | string[] | undefined>;

const paymentReferencePattern = /^[A-Za-z0-9._-]+$/;

function toURLSearchParams(params: VerifySearchParams) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => searchParams.append(key, entry));
      return;
    }
    if (value !== undefined) searchParams.set(key, value);
  });
  return searchParams;
}

export default async function VerifyPage({ searchParams: searchParamsPromise }: { searchParams: Promise<VerifySearchParams> }) {
  const searchParams = toURLSearchParams(await searchParamsPromise);
  const reference = (searchParams.get("reference") || searchParams.get("trxref") || "").trim();
  const cleanReference = reference && reference.length <= 160 && paymentReferencePattern.test(reference) ? reference : "";
  return <PageShell><PageHero eyebrow="Secure Payment" title="Payment Verification" subtitle="Confirming your cohort registration payment securely with Paystack." breadcrumbs={[{ label: "Home", href: "/" }, { label: "Payment Verification" }]} /><section className="bg-[#f7f5ef] px-5 py-16 md:px-8 md:py-24"><div className="mx-auto max-w-4xl"><PaymentVerification reference={cleanReference} /></div></section></PageShell>;
}
