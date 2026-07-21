import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState, formatStudentDate, formatStudentTime, humanizeStudentValue } from "@/components/student/StudentUi";
import type { LearningRecording, LearningResource, LearningSession, LearningSummary } from "@/lib/lms/studentLearning";

export function LearningBreadcrumbs({ items }: { items: ReadonlyArray<{ href?: string; label: string }> }) {
  return <nav aria-label="Breadcrumb" className="mb-6"><ol className="flex flex-wrap items-center gap-2 text-sm text-slate-600">{items.map((item, index) => <li key={`${item.label}-${index}`} className="flex items-center gap-2">{index ? <span aria-hidden="true">/</span> : null}{item.href ? <Link href={item.href} className="font-semibold text-amber-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">{item.label}</Link> : <span aria-current="page">{item.label}</span>}</li>)}</ol></nav>;
}

export function sessionStateLabel(session: Pick<LearningSession, "status" | "isPast">) {
  if (session.status === "live") return "Class in Progress";
  if (session.status === "completed") return "Completed Session";
  if (session.status === "cancelled") return "Cancelled";
  if (session.status === "rescheduled") return "Rescheduled";
  if (session.status === "scheduled" && !session.isPast) return "Upcoming Class";
  return humanizeStudentValue(session.status);
}

export function LearningSessionList({ sessions, empty }: { sessions: LearningSession[]; empty: string }) {
  if (!sessions.length) return <EmptyState>{empty}</EmptyState>;
  return <ol className="space-y-4">{sessions.map((session) => <li key={session.id} className="rounded-xl border border-slate-200 bg-slate-50 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.13em] text-amber-700">{session.sessionNumber ? `Session ${session.sessionNumber}` : humanizeStudentValue(session.sessionType)}</p><h3 className="mt-2 text-lg font-semibold text-[#071327]">{session.title}</h3></div><span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{sessionStateLabel(session)}</span></div><dl className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2"><div><dt className="sr-only">Date and time</dt><dd>{formatStudentDate(session.scheduledStartAt)} · {formatStudentTime(session.scheduledStartAt)}</dd></div><div><dt className="sr-only">Delivery mode and facilitator</dt><dd>{humanizeStudentValue(session.deliveryMode)}{session.facilitator ? ` · ${session.facilitator}` : ""}</dd></div></dl><div className="mt-4 flex flex-wrap gap-2">{session.hasSummary ? <ContentIndicator>Summary Available</ContentIndicator> : null}{session.hasRecording ? <ContentIndicator>Recording Available</ContentIndicator> : null}{session.hasResources ? <ContentIndicator>Resources Available</ContentIndicator> : null}</div><Link href={`/student/sessions/${session.id}`} className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[#0b315c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#124574] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">Open Session</Link></li>)}</ol>;
}

function ContentIndicator({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">{children}</span>;
}

export function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function SummaryReader({ summary }: { summary: LearningSummary | null }) {
  if (!summary) return <EmptyState>Class summary not yet available.</EmptyState>;
  const sections: Array<[string, string[]]> = [
    ["Learning Objectives", summary.learningObjectives],
    ["Key Teaching Points", summary.keyTeachingPoints],
    ["Key Scriptures / References", summary.keyScriptures],
    ["Important Concepts", summary.importantConcepts],
    ["Practical Applications", summary.practicalApplications],
    ["Assignments / Action Points", summary.actionPoints],
    ["Recommended Resources", summary.recommendedResources],
  ];
  return <article id="summary" tabIndex={-1} className="scroll-mt-8"><header className="border-b border-slate-200 pb-5"><p className="text-xs font-semibold uppercase tracking-[0.13em] text-amber-700">Published Class Summary</p><h3 className="mt-2 text-2xl font-semibold text-[#071327]">{summary.title}</h3><p className="mt-2 text-sm text-slate-500">Last Updated {formatStudentDate(summary.updatedAt, true)} · Version {summary.versionNumber}</p></header><div className="mt-6 space-y-7">{sections.filter(([, values]) => values.length).map(([title, values]) => <section key={title}><h4 className="text-lg font-semibold text-[#071327]">{title}</h4><ul className="mt-3 space-y-2 text-[0.98rem] leading-7 text-slate-700">{values.map((value, index) => <li key={`${title}-${index}`} className="flex gap-3"><span aria-hidden="true" className="mt-0.5 text-amber-700">•</span><span>{value}</span></li>)}</ul></section>)}{summary.additionalNotes ? <section><h4 className="text-lg font-semibold text-[#071327]">Additional Notes</h4><p className="mt-3 whitespace-pre-line text-[0.98rem] leading-7 text-slate-700">{summary.additionalNotes}</p></section> : null}</div></article>;
}

const resourceOrder = ["slides", "document", "worksheet", "code_repository", "link", "other"];

export function SessionResources({ resources }: { resources: LearningResource[] }) {
  if (!resources.length) return <EmptyState>No learning resources are currently available.</EmptyState>;
  const groups = new Map<string, LearningResource[]>();
  for (const resource of resources) {
    const type = resourceOrder.includes(resource.resourceType) ? resource.resourceType : "other";
    groups.set(type, [...(groups.get(type) ?? []), resource]);
  }
  return <div className="space-y-6">{resourceOrder.flatMap((type) => {
    const items = groups.get(type);
    if (!items?.length) return [];
    return [<section key={type}><h3 className="font-semibold text-[#071327]">{humanizeStudentValue(type)}</h3><ul className="mt-3 grid gap-3 md:grid-cols-2">{items.map((resource) => <li key={resource.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">{humanizeStudentValue(resource.resourceType)}</p><h4 className="mt-2 font-semibold text-[#071327]">{resource.title}</h4>{resource.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{resource.description}</p> : null}{resource.externalUrl ? <a href={resource.externalUrl} target="_blank" rel="noreferrer noopener" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#0b315c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">Open Resource<span className="sr-only">: {resource.title} (opens in a new tab)</span></a> : resource.hasControlledFile ? <p className="mt-4 text-sm font-medium text-slate-500">Secure download is not currently available.</p> : <p className="mt-4 text-sm font-medium text-slate-500">Reference provided for this class.</p>}</li>)}</ul></section>];
  })}</div>;
}

export function SessionRecordings({ recordings }: { recordings: LearningRecording[] }) {
  if (!recordings.length) return <EmptyState>No class recordings are currently available.</EmptyState>;
  return <div className="space-y-5">{recordings.map((recording) => <article key={recording.id} id={`recording-${recording.id}`} className="scroll-mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Recording Available</p><h3 className="mt-2 text-lg font-semibold text-[#071327]">{recording.title}</h3></div>{recording.provider ? <span className="text-sm text-slate-500">{humanizeStudentValue(recording.provider)}</span> : null}</div><dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">{formatDuration(recording.durationSeconds) ? <div><dt className="sr-only">Duration</dt><dd>{formatDuration(recording.durationSeconds)}</dd></div> : null}{recording.availableFrom ? <div><dt className="sr-only">Available from</dt><dd>From {formatStudentDate(recording.availableFrom, true)}</dd></div> : null}{recording.availableUntil ? <div><dt className="sr-only">Available until</dt><dd>Until {formatStudentDate(recording.availableUntil, true)}</dd></div> : null}</dl>{recording.availability === "expired" ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This recording is no longer available.</p> : recording.availability === "upcoming" ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This recording will become available on {formatStudentDate(recording.availableFrom, true)}.</p> : recording.canWatch ? <a href={`/api/student/recordings/${recording.id}`} className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[#0b315c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#124574] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">Open tracked recording<span className="sr-only">: {recording.title}</span></a> : <p className="mt-4 text-sm text-slate-600">Playback access has not yet been published.</p>}<p className="mt-4 text-xs leading-5 text-slate-500">Opening this recording creates or reuses the appropriate assignment. Revision viewing never changes official live attendance or adds academic credit.</p></article>)}</div>;
}
