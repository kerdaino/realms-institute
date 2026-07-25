"use client";

import { useState, type FormEvent } from "react";

import { submitPrivateFileForm } from "@/components/student/privateUpload";
import { learningResourceTypeOptions } from "@/lib/lms/learningResources";
import { learningResourceFileAccept, privateFileLimits } from "@/lib/lms/privateFilePolicy";

type Appearance = "dark" | "light";

export function LearningResourceForm({ endpoint, appearance }: { endpoint: string; appearance: Appearance }) {
  const [source, setSource] = useState<"external_link" | "upload_material">("external_link");
  const [category, setCategory] = useState("scripture_reference");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const dark = appearance === "dark";
  const fieldClass = dark
    ? "mt-2 block min-h-11 w-full rounded-xl border border-white/15 bg-[#050d1c]/60 px-3 py-2 text-white"
    : "mt-2 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[#071327]";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true);
    setMessage("");
    setProgress(null);
    try {
      if (source === "external_link") {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source,
            title: form.get("title"),
            description: form.get("description"),
            resource_type: form.get("resource_type"),
            external_url: form.get("external_url"),
            publish_now: form.get("publish_now") === "on",
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "The learning resource could not be added.");
      } else {
        form.set("publish_now", String(form.get("publish_now") === "on"));
        await submitPrivateFileForm(endpoint, form, setProgress);
      }
      setMessage("Learning resource added.");
      element.reset();
      setSource("external_link");
      setCategory("scripture_reference");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The learning resource could not be added.");
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <details className={dark ? "rounded-xl border border-white/10 p-4" : "rounded-xl border border-slate-200 bg-slate-50 p-4"}>
      <summary className="cursor-pointer text-sm font-semibold">+ Add Resource</summary>
      <form onSubmit={submit} className="mt-5 grid gap-4">
        <label className="text-sm font-semibold">Resource title *
          <input name="title" required maxLength={240} className={fieldClass} />
        </label>
        <label className="text-sm font-semibold">Description <span className="font-normal opacity-70">(optional)</span>
          <textarea name="description" rows={3} maxLength={5000} className={`${fieldClass} min-h-24`} />
        </label>
        <fieldset>
          <legend className="text-sm font-semibold">Resource source</legend>
          <div className="mt-2 flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="source" value="external_link" checked={source === "external_link"} onChange={() => { setSource("external_link"); setCategory("scripture_reference"); }} />
              External Link
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="source" value="upload_material" checked={source === "upload_material"} onChange={() => { setSource("upload_material"); setCategory("document"); }} />
              Upload Material
            </label>
          </div>
        </fieldset>
        {source === "external_link" ? (
          <label className="text-sm font-semibold">URL *
            <input name="external_url" type="url" required placeholder="https://" className={fieldClass} />
          </label>
        ) : (
          <label className="text-sm font-semibold">File *
            <input name="attachment" type="file" required accept={learningResourceFileAccept} className={`${fieldClass} file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-1.5 file:font-semibold`} />
            <span className="mt-2 block text-xs font-normal opacity-70">
              PDF, DOCX, PPTX, XLSX, TXT, JPEG, PNG or WebP. Maximum {privateFileLimits.learningResource / (1024 * 1024)} MB.
            </span>
          </label>
        )}
        <label className="text-sm font-semibold">Resource type/category
          <select name="resource_type" value={category} onChange={(event) => setCategory(event.target.value)} className={fieldClass}>
            {learningResourceTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input name="publish_now" type="checkbox" defaultChecked className="mt-1" />
          <span><strong>Publish to enrolled students now</strong><span className="mt-1 block text-xs font-normal opacity-70">The resource will appear in the existing student Resources areas.</span></span>
        </label>
        {source === "upload_material" && busy ? <p className="text-sm">{progress === null ? "Uploading learning material…" : `Uploading learning material… ${progress}%`}</p> : null}
        {message ? <p role="status" className={message === "Learning resource added." ? "text-sm text-emerald-600" : "text-sm text-rose-600"}>{message}</p> : null}
        <button disabled={busy} className={dark ? "min-h-11 rounded-full bg-[var(--realm-gold)] px-5 py-2.5 text-sm font-semibold text-[#071327] disabled:opacity-50" : "min-h-11 rounded-xl bg-[#071327] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"}>
          {busy ? "Adding…" : source === "external_link" ? "Add Resource" : "Upload Material"}
        </button>
      </form>
    </details>
  );
}
