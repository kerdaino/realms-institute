import type { Metadata } from "next";

import { PageHero } from "@/components/layout/PageHero";
import { PageShell } from "@/components/layout/PageShell";
import { PaymentVerification } from "@/components/payment/PaymentVerification";

export const metadata: Metadata = { title: "Payment Verification | REALMS Institute" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  const { reference = "" } = await searchParams;
  return <PageShell><PageHero eyebrow="Secure Payment" title="Payment Verification" subtitle="Confirming your cohort registration payment securely with Paystack." breadcrumbs={[{ label: "Home", href: "/" }, { label: "Payment Verification" }]} /><section className="bg-[#f7f5ef] px-5 py-16 md:px-8 md:py-24"><div className="mx-auto max-w-4xl"><PaymentVerification reference={reference} /></div></section></PageShell>;
}
