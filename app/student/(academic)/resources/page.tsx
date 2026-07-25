import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeading, StudentPanel } from "@/components/student/StudentUi";
import { requireRole } from "@/lib/lms/auth";
import { fileTypeLabel, learningResourceTypeLabel } from "@/lib/lms/learningResources";
import { getStudentDashboardData } from "@/lib/lms/studentDashboard";

export const metadata: Metadata = { title: "Learning Resources | REALMS Institute" };

export default async function StudentResourcesPage() {
  const { user } = await requireRole("student");
  const data = await getStudentDashboardData(user.id, true);
  if (!data.student || !data.enrollment) return null;
  const groups = new Map<string, typeof data.resources>();
  for (const resource of data.resources) {
    const key = `${resource.courseCode} · ${resource.sessionTitle}`;
    groups.set(key, [...(groups.get(key) ?? []), resource]);
  }
  return <><PageHeading eyebrow="Student Portal" title="Resources" description="Active learning resources published for class sessions in your enrolled courses." />{groups.size ? <div className="space-y-6">{[...groups.entries()].map(([label, resources]) => <StudentPanel key={label} title={label}><ul className="grid gap-4 md:grid-cols-2">{resources.map((resource) => <li key={resource.id} className="rounded-xl border border-slate-200 bg-slate-50 p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">{[fileTypeLabel(resource.fileName), learningResourceTypeLabel(resource.resourceType)].filter(Boolean).join(" · ")}</p><h3 className="mt-2 font-semibold text-[#071327]">{resource.title}</h3>{resource.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{resource.description}</p> : null}{resource.externalUrl ? <a href={resource.externalUrl} target="_blank" rel="noreferrer noopener" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#0b315c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#124574] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">Open Resource <span className="sr-only">: {resource.title} (opens in a new tab)</span></a> : resource.hasControlledFile ? <a href={`/api/student/session-resources/${resource.id}/download`} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#0b315c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#124574] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">Open Material<span className="sr-only">: {resource.title}</span></a> : <p className="mt-4 text-sm font-medium text-slate-500">Reference provided for this class.</p>}<Link href={`/student/sessions/${resource.sessionId}#resources`} className="mt-3 block text-sm font-semibold text-amber-800 underline-offset-4 hover:underline">View Class Session</Link></li>)}</ul></StudentPanel>)}</div> : <EmptyState>No learning resources have been published yet.</EmptyState>}</>;
}
