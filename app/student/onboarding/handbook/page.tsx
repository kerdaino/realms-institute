import type { Metadata } from "next";
import Link from "next/link";

import { HandbookAcknowledgementForm } from "@/components/student/HandbookAcknowledgementForm";
import { StudentPanel } from "@/components/student/StudentUi";
import { requireRole } from "@/lib/lms/auth";
import { getStudentHandbookState } from "@/lib/lms/studentHandbook";

export const metadata: Metadata = { title: "Student Handbook | REALMS Institute" };

export default async function StudentHandbookOnboardingPage() {
  const { user } = await requireRole("student");
  const state = await getStudentHandbookState(user.id);
  const document = state.requiredDocument;

  if (!document) return <StudentPanel title="Student Handbook" description="No handbook acknowledgement is currently required for your cohort."><Link href="/student" className="font-semibold text-amber-800 underline underline-offset-4">Return to the Student Dashboard</Link></StudentPanel>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="rounded-3xl bg-[linear-gradient(135deg,#071b35,#0e3a68)] p-7 text-white shadow-lg md:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--realm-gold-soft)]">{document.school}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">August 2026 Student Handbook</h1>
        <p className="mt-3 text-white/75">Version {document.version}</p>
      </header>

      <StudentPanel title="Read the Current Required Handbook" description="Your authenticated student account, student identity, handbook version and the server-recorded time form this electronic acknowledgement. No handwritten or image signature is required.">
        <div className="flex flex-wrap gap-3">
          <a href={document.fileHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-[#071327] px-5 py-2.5 text-sm font-semibold text-white">View Handbook</a>
          <a href={document.fileHref} download className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-[#071327]">Download Handbook</a>
        </div>

        {state.acknowledgement ? (
          <div className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
            <p className="font-semibold">Version {document.version} acknowledged</p>
            <p className="mt-2 text-sm">Acknowledged: {new Date(state.acknowledgement.acknowledged_at).toLocaleString("en-NG", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Lagos" })}</p>
            <Link href="/student" className="mt-4 inline-block text-sm font-semibold underline underline-offset-4">Continue to the Student Dashboard</Link>
          </div>
        ) : (
          <>
            {!state.storageAvailable ? <p className="mt-7 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Handbook acknowledgement setup is pending. You can read or download the handbook now, but acknowledgement cannot yet be recorded. Please contact REALMS Institute.</p> : null}
            <HandbookAcknowledgementForm acknowledgementText={document.acknowledgementText} disabled={!state.storageAvailable} />
          </>
        )}
      </StudentPanel>
    </div>
  );
}
