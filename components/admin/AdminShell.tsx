import type { ReactNode } from "react";

import { AdminNav } from "@/components/admin/AdminNav";

export function AdminShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <><AdminNav /><main className="mx-auto max-w-7xl px-5 py-10 md:px-8"><div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Institute Administration</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#071327]">{title}</h1><p className="mt-2 max-w-3xl text-slate-600">{description}</p></div>{children}</main></>;
}
