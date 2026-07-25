"use client";

import { useState } from "react";

import { LearningResourceForm } from "@/components/portal/LearningResourceForm";
import { fileTypeLabel, learningResourceTypeLabel } from "@/lib/lms/learningResources";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function FacilitatorResourceManager({ sessionId, resources }: { sessionId: string; resources: Row[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function deactivate(resourceId: string) {
    if (!window.confirm("Remove this resource from student visibility? The stored record and any private file will be retained.")) return;
    setBusyId(resourceId);
    setMessage("");
    const response = await fetch(`/api/facilitator/sessions/${sessionId}/resources/${resourceId}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(typeof data.message === "string" ? data.message : "The learning resource could not be deactivated.");
      setBusyId(null);
      return;
    }
    window.location.reload();
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-6">
      <h2 className="text-xl font-semibold">Learning Resources</h2>
      <p className="mt-2 text-sm text-[var(--realm-muted)]">Add references and teaching materials for this assigned class session.</p>
      {message ? <p role="alert" className="mt-4 rounded-xl border border-rose-300/25 bg-rose-300/10 p-3 text-sm text-rose-100">{message}</p> : null}
      {resources.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--realm-muted)]">No resources are available for this session.</p>
      ) : (
        <ul className="my-5 space-y-3">
          {resources.map((item) => {
            const id = text(item.id);
            if (!id) return null;
            const filename = text(item.file_name);
            return (
              <li key={id} className="rounded-xl border border-white/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <strong>{text(item.title)}</strong>
                    <p className="mt-1 text-sm text-[var(--realm-muted)]">
                      {[fileTypeLabel(filename), learningResourceTypeLabel(text(item.resource_type) || "other")].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className={item.is_active ? "rounded-full bg-emerald-300/15 px-2.5 py-1 text-xs text-emerald-100" : "rounded-full bg-white/10 px-2.5 py-1 text-xs text-[var(--realm-muted)]"}>
                    {item.is_active ? (item.access_level === "enrolled_students" ? "Published" : "Facilitators only") : "Inactive"}
                  </span>
                </div>
                {text(item.description) ? <p className="mt-2 text-sm text-[var(--realm-muted)]">{text(item.description)}</p> : null}
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  {text(item.external_url) ? <a href={text(item.external_url)!} target="_blank" rel="noreferrer noopener" className="font-semibold text-[var(--realm-gold-soft)]">Open Resource</a> : null}
                  {filename ? <a href={`/api/facilitator/sessions/${sessionId}/resources/${id}/download`} className="font-semibold text-[var(--realm-gold-soft)]">Open Material</a> : null}
                  {item.is_active ? <button disabled={busyId === id} onClick={() => void deactivate(id)} className="font-semibold text-rose-200 disabled:opacity-50">{busyId === id ? "Removing…" : "Deactivate"}</button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-5">
        <LearningResourceForm endpoint={`/api/facilitator/sessions/${sessionId}/resources`} appearance="dark" />
      </div>
    </section>
  );
}
