/* Server-rendered deadline eligibility intentionally uses the request-time clock. */
/* eslint-disable react-hooks/purity */
import { notFound } from "next/navigation";

import { AssignmentSubmissionForm } from "@/components/student/StudentAssessmentUi";
import { StudentPanel, formatStudentDate } from "@/components/student/StudentUi";
import { humanizeAssessment } from "@/lib/lms/assessment";
import { fetchStudentAssignment } from "@/lib/lms/assessmentData";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
import { requireRole } from "@/lib/lms/auth";

type Row = Record<string, unknown>;
function object(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function relation(value: unknown) { return Array.isArray(value) ? object(value[0]) : object(value); }

export default async function StudentAssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { user } = await requireRole("student");
  const { assignmentId } = await params;
  let detail;
  try {
    detail = await fetchStudentAssignment(requireLmsAdminClient(), user.id, assignmentId);
  } catch (error) {
    if (error instanceof LmsAdminDataError && [403, 404].includes(error.status)) notFound();
    throw error;
  }
  const assignment = detail.assignment as Row;
  const course = relation(relation(assignment.cohort_courses).courses);
  const requirements = object(assignment.submission_requirements);
  const latest = detail.submissions[0] as Row | undefined;
  const attemptsUsed = detail.submissions.length;
  const canSubmit = attemptsUsed < Number(assignment.max_submission_attempts)
    && (!latest || latest.review_outcome === "revision_required")
    && (!(assignment.due_at && Date.parse(String(assignment.due_at)) < Date.now()) || Boolean(assignment.allow_late_submission));

  return <div className="space-y-6">
    <header className="rounded-3xl bg-[linear-gradient(135deg,#092648,#0e3a68)] p-6 text-white">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--realm-gold-soft)]">{String(course.code)} · {humanizeAssessment(String(assignment.assignment_type))}</p>
      <h1 className="mt-3 text-3xl font-semibold">{String(assignment.title)}</h1>
      <p className="mt-3 text-white/75">Due {assignment.due_at ? formatStudentDate(String(assignment.due_at), true) : "without a fixed deadline"} · {String(assignment.max_score)} points</p>
    </header>
    <StudentPanel title="Instructions">
      <p className="whitespace-pre-wrap leading-7 text-slate-700">{String(assignment.instructions ?? assignment.description ?? "Follow the guidance provided by your facilitator.")}</p>
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <div><dt className="text-xs font-semibold uppercase text-slate-500">Category</dt><dd>{humanizeAssessment(String(assignment.assessment_category))}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-slate-500">Attempts</dt><dd>{attemptsUsed} / {String(assignment.max_submission_attempts)}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-slate-500">Late submission</dt><dd>{assignment.allow_late_submission ? "Allowed and recorded" : "Not allowed"}</dd></div>
      </dl>
    </StudentPanel>
    {detail.rubric.length ? <StudentPanel title="Published rubric"><ul className="space-y-2">{detail.rubric.map((criterion) => <li key={criterion.id} className="rounded-xl bg-slate-50 p-4"><strong>{criterion.criterion}</strong> · {criterion.max_points} points<p className="text-sm text-slate-600">{criterion.description}</p></li>)}</ul></StudentPanel> : null}
    <StudentPanel title={latest?.review_outcome === "revision_required" ? "Submit revision" : "Submit assignment"}>
      <AssignmentSubmissionForm assignmentId={assignmentId} requirements={requirements} canSubmit={canSubmit} isResubmission={Boolean(latest)} />
      {!canSubmit ? <p className="text-sm text-slate-600">A new submission is not currently available.</p> : null}
    </StudentPanel>
    {detail.submissions.length ? <StudentPanel title="Submission history"><div className="space-y-3">{detail.submissions.map((submission) => {
      const artifacts = ((submission as Row).assignment_submission_artifacts as Row[] | undefined) ?? [];
      return <article key={submission.id} className="rounded-xl border border-slate-200 p-4">
        <div className="flex justify-between gap-3"><strong>Attempt {submission.attempt_number}</strong><span className="text-sm">{humanizeAssessment(submission.submission_status)}</span></div>
        <p className="mt-1 text-sm text-slate-500">{formatStudentDate(submission.submitted_at, true)}{submission.is_late ? " · Submitted late" : ""}</p>
        {artifacts.filter((item) => item.artifact_status === "active").map((item) => <a key={String(item.id)} href={`/api/student/assignment-artifacts/${String(item.id)}/download`} className="mt-3 block font-semibold text-amber-800">Download {String(item.file_name || item.title || "private attachment")}</a>)}
        {submission.submission_status === "under_integrity_review" ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Your assessment is currently under academic review. REALMS may contact you for clarification.</p> : null}
        {submission.feedback ? <p className="mt-3 text-sm"><strong>Feedback:</strong> {submission.feedback}</p> : null}
        {submission.score_percentage != null ? <p className="mt-2 text-sm font-semibold">Score: {submission.score_points} / {String(assignment.max_score)} ({submission.score_percentage}%)</p> : null}
      </article>;
    })}</div></StudentPanel> : null}
  </div>;
}
