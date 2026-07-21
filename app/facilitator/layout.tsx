import { requireRole } from "@/lib/lms/auth";

export default async function FacilitatorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireRole("facilitator");
  return children;
}
