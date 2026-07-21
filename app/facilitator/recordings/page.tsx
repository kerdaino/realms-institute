import Link from "next/link";

import { PortalShell } from "@/components/portal/PortalShell";
import { requireRole } from "@/lib/lms/auth";
import { fetchFacilitatorRecordingAssignments } from "@/lib/lms/recordingData";
import { resolveFacilitatorSessionContext } from "@/lib/lms/facilitatorSessions";

export default async function FacilitatorRecordingsPage() {
  await requireRole("facilitator");
  const context = await resolveFacilitatorSessionContext();
  const rows = await fetchFacilitatorRecordingAssignments(context.supabase, context.facilitatorId);
  return <PortalShell eyebrow="Faculty Portal" title="Recorded Learning" description="Read-only progress for students in your assigned course offerings.">
    <div className="mb-5 flex gap-4"><Link href="/facilitator" className="font-semibold text-amber-800">Faculty home</Link><Link href="/facilitator/sessions" className="font-semibold text-amber-800">Assigned sessions</Link></div>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50"><tr>{["Student", "Course / Session", "Purpose", "Watch", "Checkpoints", "Practical / Reflection", "Learning", "Integrity"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-200">{rows.map((row) => <tr key={row.id}><td className="px-4 py-3"><strong>{row.student.name}</strong><span className="block text-xs text-slate-500">{row.student.number}</span></td><td className="px-4 py-3">{row.course.code}<span className="block text-xs text-slate-500">{row.session.title}</span></td><td className="px-4 py-3">{row.purposeLabel}</td><td className="px-4 py-3">{Math.floor(row.progress.watchPercentage)}%</td><td className="px-4 py-3">{row.requirementSummary.checkpoints}</td><td className="px-4 py-3">{row.requirementSummary.practical !== "not_required" ? row.requirementSummary.practical : row.requirementSummary.reflection}</td><td className="px-4 py-3">{row.displayStatus}</td><td className="px-4 py-3">{row.progress.integrityStatus === "clear" ? "Clear" : "Integrity Review Required"}</td></tr>)}</tbody></table>{!rows.length ? <p className="p-8 text-center text-slate-600">No recorded-learning assignments are available for your assigned courses.</p> : null}</div>
    <p className="mt-4 text-sm text-slate-600">This view is limited to assigned course offerings. Recording answer keys, private student notes, and unrelated courses are not included.</p>
  </PortalShell>;
}
