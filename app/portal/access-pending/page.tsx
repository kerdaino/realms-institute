import type { Metadata } from "next";

import { PortalShell } from "@/components/portal/PortalShell";
import { requireAuthenticatedUser } from "@/lib/lms/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Institutional Access Pending | REALMS Institute" };

export default async function PortalAccessPendingPage() {
  await requireAuthenticatedUser();
  return <PortalShell eyebrow="Account Status" title="Institutional Access Pending"><div className="max-w-3xl rounded-2xl border border-amber-300/25 bg-amber-300/10 p-6 text-base leading-8 text-amber-50">Your account exists, but institutional access has not yet been activated. Please contact REALMS Institute.</div></PortalShell>;
}
