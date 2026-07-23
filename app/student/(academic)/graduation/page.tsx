import { DataCard, StudentPanel } from "@/components/student/StudentUi";
import { requireRole } from "@/lib/lms/auth";
import { fetchStudentGraduationTracker } from "@/lib/lms/resultData";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const statusLabels: Record<string, string> = { met: "Completed", pending: "Not Yet Assessed", not_met: "Not Met", under_review: "Under Review", waived: "Waived", not_applicable: "Not Applicable" };

export default async function StudentGraduationPage() {
  const { user } = await requireRole("student");
  const data = await fetchStudentGraduationTracker(await createSupabaseServerClient(), user.id);
  const policy = data.policy;

  return <div className="space-y-6">
    <StudentPanel title="Programme Completion Eligibility" description="This tracker shows your progress toward the requirements for successful completion of the REALMS School of Discovery programme. Final completion is confirmed only after all academic, attendance, participation, integrity and capstone requirements have been reviewed and approved.">
      {policy ? <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DataCard label="Overall Minimum" value={`${policy.overall_pass_points} / 100`} />
        <DataCard label="Discipleship Minimum" value={`${policy.discipleship_gate_points} / ${policy.discipleship_max_points}`} />
        <DataCard label="Skill Minimum" value={`${policy.skill_gate_points} / ${policy.skill_max_points}`} />
        <DataCard label="Attendance, Participation & Integrity" value={`${policy.engagement_gate_points} / ${policy.engagement_max_points}`} />
      </div> : null}
      <div className="grid gap-3">
        {data.rows.map(({ definition, tracker }) => <article key={definition.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-semibold text-[#071327]">{definition.requirement_name}</h2>{definition.requirement_description ? <p className="mt-1 text-sm text-slate-600">{definition.requirement_description}</p> : null}</div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tracker.requirement_status === "met" ? "bg-emerald-100 text-emerald-800" : tracker.requirement_status === "under_review" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{statusLabels[tracker.requirement_status] ?? "Pending"}</span>
          </div>
          <p className="mt-3 text-sm text-slate-700">{tracker.evidence_summary}</p>
          {tracker.required_value !== null ? <p className="mt-2 text-xs text-slate-500">Current: {tracker.current_value ?? "Not Yet Assessed"} · Required: {tracker.required_value}</p> : null}
        </article>)}
      </div>
      {!data.rows.length && policy ? <p className="rounded-xl bg-amber-50 p-4 text-amber-950">Detailed requirement progress is not yet available. The governing completion requirements are shown above.</p> : null}
      {!policy ? <p className="rounded-xl bg-amber-50 p-4 text-amber-950">Programme requirements are not yet available. Please contact REALMS administration.</p> : null}
    </StudentPanel>
    <StudentPanel title="Additional Completion Requirements">
      <ul className="grid gap-3 text-sm leading-6 text-slate-700 md:grid-cols-2">
        {["Skill capstone submission and defence", "Final discipleship-route assessment", "Attendance and assigned catch-up compliance", "No unresolved serious conduct or academic-integrity case"].map((requirement) => <li key={requirement} className="flex gap-3"><span aria-hidden="true" className="text-amber-700">•</span><span>{requirement}</span></li>)}
      </ul>
    </StudentPanel>
    <p className="text-sm leading-6 text-slate-600">A completed requirement means the currently reviewed evidence meets that requirement. Reaching the minimum score does not automatically produce a certificate. Certificate eligibility follows final academic review and institutional approval.</p>
  </div>;
}
