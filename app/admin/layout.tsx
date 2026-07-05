import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-slate-100 text-slate-950">{children}</div>;
}
