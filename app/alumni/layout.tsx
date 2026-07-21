import type { ReactNode } from "react";

import { AlumniShell } from "@/components/alumni/AlumniShell";
import { requireRole } from "@/lib/lms/auth";

export const dynamic = "force-dynamic";

export default async function AlumniLayout({ children }: { children: ReactNode }) { await requireRole("alumni"); return <AlumniShell>{children}</AlumniShell>; }
