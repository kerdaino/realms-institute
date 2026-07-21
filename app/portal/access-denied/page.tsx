import type { Metadata } from "next";

import { PortalShell } from "@/components/portal/PortalShell";
import { requireAuthenticatedUser } from "@/lib/lms/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Access Denied | REALMS Institute" };

export default async function PortalAccessDeniedPage() {
  await requireAuthenticatedUser();
  return <PortalShell eyebrow="Protected Portal" title="Access Denied"><div className="max-w-3xl rounded-2xl border border-red-300/25 bg-red-300/10 p-6 text-base leading-8 text-red-50">Your institutional account does not have access to this portal area. Please contact REALMS Institute if you believe this is incorrect.</div></PortalShell>;
}
