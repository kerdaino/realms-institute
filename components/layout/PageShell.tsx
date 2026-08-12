import type { ReactNode } from "react";

import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { getPublicRegistrationState } from "@/lib/registrationControl.server";

type PageShellProps = {
  children: ReactNode;
};

export async function PageShell({ children }: PageShellProps) {
  const registration = await getPublicRegistrationState();
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar registrationOpen={registration.kind === "open"} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
