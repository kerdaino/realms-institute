/* Server-rendered next actions intentionally use the request-time assessment window. */
/* eslint-disable react-hooks/purity */
import Link from "next/link";
import type { Metadata } from "next";

import { DataCard, EmptyState, formatStudentDate, formatStudentTime, humanizeStudentValue, StudentPanel } from "@/components/student/StudentUi";
import { requireRole } from "@/lib/lms/auth";
import { getStudentDashboardData, type StudentCourse, type StudentSession } from "@/lib/lms/studentDashboard";
import { getStudentAttendanceData } from "@/lib/lms/studentAttendance";
import { getStudentRecordingAssignments } from "@/lib/lms/recordingData";
import { assessmentStudentStatus, fetchStudentAssignments, fetchStudentQuizzes } from "@/lib/lms/assessmentData";
import { assessmentUrgency } from "@/lib/lms/assessment";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { getStudentAbsenceRequests, getStudentStandaloneMakeups } from "@/lib/lms/absenceData";
import { fetchStudentGraduationTracker, fetchStudentResultData } from "@/lib/lms/resultData";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStudentHandbookAcknowledgement } from "@/lib/lms/studentHandbookGate";
import { deriveStudentLifecycle } from "@/lib/lms/studentLifecycle";

export const metadata: Metadata = { title: "Student Dashboard | REALMS Institute" };

function CoursePreview({ courses }: { courses: StudentCourse[] }) {
  if (!courses.length) return <EmptyState>Your course enrolment is still being prepared. Please contact REALMS Institute if this persists.</EmptyState>;
  return <ul className="space-y-3">{courses.slice(0, 4).map((course) => <li key={course.offeringId}><Link href={`/student/courses/${course.courseEnrollmentId}`} className="block rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-amber-300 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"><p className="text-xs font-semibold tracking-[0.12em] text-amber-700">{course.code}</p><p className="mt-1 font-semibold leading-6 text-[#071327]">{course.title}</p></Link></li>)}</ul>;
}

function SessionCard({ session }: { session: StudentSession }) {
  const content = <><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold tracking-[0.12em] text-amber-700">{session.courseCode}</p><h3 className="mt-1 font-semibold text-[#071327]">{session.title}</h3><p className="mt-1 text-sm text-slate-600">{session.courseTitle}</p></div><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">{humanizeStudentValue(session.deliveryMode)}</span></div><p className="mt-3 text-sm text-slate-700">{formatStudentDate(session.scheduledStartAt)} · {formatStudentTime(session.scheduledStartAt)}</p></>;
  const style = "block rounded-xl border border-slate-200 p-4";
  return <li>{session.href ? <Link href={session.href} className={`${style} transition hover:border-amber-300 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700`}>{content}</Link> : <article className={style}>{content}</article>}</li>;
}

export default async function StudentDashboardPage() {
  const { user } = await requireRole("student");
  const handbookState = await requireStudentHandbookAcknowledgement(user.id);
  const assessmentClient = requireLmsAdminClient();
  const studentClient = await createSupabaseServerClient();
  const [data, attendance, recordedLearning, assignments, quizzes, absenceRequests, standaloneMakeups, publishedResult, completionTracker] = await Promise.all([getStudentDashboardData(user.id), getStudentAttendanceData(user.id), getStudentRecordingAssignments(user.id), fetchStudentAssignments(assessmentClient, user.id), fetchStudentQuizzes(assessmentClient, user.id), getStudentAbsenceRequests(user.id), getStudentStandaloneMakeups(user.id), fetchStudentResultData(studentClient, user.id), fetchStudentGraduationTracker(studentClient, user.id)]);
  if (!data.student || !data.enrollment) return null;
  const routeName = data.enrollment.discipleship_route === "advanced" ? "Advanced Discipleship Programme" : "Foundational Discipleship Programme";
  const pathwayName = data.enrollment.skill_pathway === "web_development" ? "Web Development" : "Cybersecurity Foundations";
  const lifecycle = deriveStudentLifecycle({
    studentStatus: data.student.student_status,
    enrollmentStatus: data.enrollment.enrolment_status,
    onboardingStatus: data.student.onboarding_status,
    orientationCompletedAt: data.student.orientation_completed_at,
    matriculatedAt: data.student.matriculated_at,
    portalAccountStatus: data.profile?.account_status,
    handbookRequired: Boolean(handbookState.requiredDocument),
    handbookAcknowledged: handbookState.acknowledged,
  });
  const requiredRecordings = recordedLearning.filter((item) => item.purposeCode !== "REV" && !["verified_complete", "late_complete"].includes(item.completionStatus ?? ""));
  const overdueRecording = requiredRecordings.find((item) => item.displayStatus === "incomplete");
  const checkpointRecording = requiredRecordings.find((item) => item.id !== overdueRecording?.id && item.displayStatus === "awaiting_checkpoint");
  const activeRecording = requiredRecordings.find((item) => item.id !== overdueRecording?.id && item.id !== checkpointRecording?.id && item.progress.status !== "not_started");
  const newRecording = requiredRecordings.find((item) => item.id !== overdueRecording?.id && item.progress.status === "not_started");
  const assessmentActions = [
    ...assignments.flatMap((assignment) => { const status = assessmentStudentStatus(assignment); if (!["open", "overdue", "revision_required"].includes(status)) return []; const label = status === "revision_required" ? "Resubmission Required" : assignment.assignment_type === "practical" ? "Practical Due" : assignment.assignment_type === "reflection" ? "Reflection Due" : "Assignment Due"; return [{ label: `${label}: ${assignment.title}`, href: `/student/assignments/${assignment.id}`, dueAt: assignment.due_at, status, kind: String(assignment.assignment_type) }]; }),
    ...quizzes.flatMap((quiz) => { const latest = quiz.latest_attempt; const status = latest?.attempt_status === "in_progress" ? "in_progress" : (!quiz.opens_at || Date.parse(quiz.opens_at) <= Date.now()) && (!quiz.closes_at || Date.parse(quiz.closes_at) > Date.now()) && quiz.attempts.length < quiz.max_attempts ? "available" : ""; if (!status) return []; return [{ label: `Quiz Available: ${quiz.title}`, href: `/student/quizzes/${quiz.id}`, dueAt: quiz.closes_at, status, kind: "quiz" }]; }),
  ].sort((a, b) => assessmentUrgency(a) - assessmentUrgency(b)).slice(0, 5);
  const absenceActions = absenceRequests.flatMap((request) => {
    if (request.status === "more_information_required") return [{ label: "Additional Information Required", href: `/student/absences/${request.id}` }];
    if (!request.makeup) return [];
    if (request.makeup.status === "overdue") return [{ label: "Make-Up Overdue", href: `/student/absences/${request.id}` }];
    if (request.makeup.status === "awaiting_quiz") return [{ label: "Complete Make-Up Quiz", href: `/student/absences/${request.id}` }];
    if (request.makeup.status === "awaiting_practical") return [{ label: "Submit Make-Up Practical", href: `/student/absences/${request.id}` }];
    if (request.makeup.status === "awaiting_reflection") return [{ label: "Submit Make-Up Reflection", href: `/student/absences/${request.id}` }];
    if (request.makeup.status === "awaiting_oral_verification") return [{ label: "Oral Verification Required", href: `/student/absences/${request.id}` }];
    if (["assigned", "not_started", "in_progress", "awaiting_checkpoint"].includes(request.makeup.status)) return [{ label: request.makeup.status === "not_started" || request.makeup.status === "assigned" ? "Make-Up Required" : "Continue Make-Up Recording", href: `/student/absences/${request.id}` }];
    return [];
  });
  const standaloneMakeupActions = standaloneMakeups.filter((item) => !["completed", "late_complete", "waived", "cancelled"].includes(item.status)).map((item) => ({ label: item.status === "overdue" ? "Make-Up Overdue" : "Make-Up Required", href: item.recordingAssignmentId ? `/student/recordings/${item.recordingAssignmentId}` : "/student/absences" }));
  const upcomingClass = data.upcomingSessions.find((item) => item.kind === "class_session");
  const nextActions = [
    ...absenceActions,
    ...standaloneMakeupActions,
    upcomingClass ? { label: "Report Upcoming Absence", href: "/student/absences/new" } : null,
    ...assessmentActions.map(({ label, href }) => ({ label, href })),
    upcomingClass?.href ? { label: "Attend Upcoming Class", href: upcomingClass.href } : null,
    data.recentSummaries[0] ? { label: "Review Latest Class Summary", href: `/student/sessions/${data.recentSummaries[0].sessionId}#summary` } : null,
    overdueRecording ? { label: "Recorded Module Overdue", href: `/student/recordings/${overdueRecording.id}` } : null,
    checkpointRecording ? { label: "Complete Recording Checkpoint", href: `/student/recordings/${checkpointRecording.id}` } : null,
    activeRecording ? { label: "Continue Recording", href: `/student/recordings/${activeRecording.id}` } : null,
    newRecording ? { label: "Start Required Recording", href: `/student/recordings/${newRecording.id}` } : null,
  ].filter((action): action is { label: string; href: string } => Boolean(action));

  return (
    <div className="space-y-6">
      <header className="rounded-3xl bg-[linear-gradient(135deg,#092648,#0e3a68)] p-6 text-white shadow-lg md:p-8">
        <p className="text-sm font-semibold text-[var(--realm-gold-soft)]">{data.greeting}, {data.displayName}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Student Dashboard</h1>
        <p className="mt-3 text-white/75">REALMS School of Discovery</p>
        <p className="text-white/75">{data.cohort?.name ?? "Cohort assignment pending"}</p>
        <dl className="mt-6 grid gap-4 border-t border-white/15 pt-5 sm:grid-cols-2">
          <div><dt className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">Student ID</dt><dd className="mt-1 font-semibold">{data.student.student_number}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">Academic Status</dt><dd className="mt-1 font-semibold">{lifecycle.academicStatus}</dd></div>
        </dl>
      </header>

      {handbookState.requiredDocument && handbookState.acknowledgement ? <StudentPanel title="Student Handbook" description={`${handbookState.requiredDocument.cohortLabel} — Version ${handbookState.requiredDocument.version}`} action={<div className="flex flex-wrap gap-3"><a href={handbookState.requiredDocument.fileHref} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-amber-800 underline underline-offset-4">View Handbook</a><a href={handbookState.requiredDocument.fileHref} download className="text-sm font-semibold text-amber-800 underline underline-offset-4">Download PDF</a></div>}><DataCard label="Acknowledged" value={formatStudentDate(handbookState.acknowledgement.acknowledged_at)} detail={`Version ${handbookState.acknowledgement.document_version} acknowledgement is permanently preserved.`} /></StudentPanel> : null}

      <StudentPanel title="Academic Standing & Support" description="Formal notices, response rights, mentor support, and recovery actions are kept separate from operational engagement alerts." action={<Link href="/student/standing" className="rounded-lg text-sm font-semibold text-amber-800 underline-offset-4 hover:underline">Open Standing &amp; Support</Link>}>
        <DataCard label="Current Academic Standing" value={humanizeStudentValue(data.enrollment.academic_standing)} detail="Standing changes require an authorised decision and recorded reason." />
      </StudentPanel>

      <StudentPanel title="Programme Completion Eligibility" description={publishedResult.result ? "Your published result and current completion eligibility are available." : "Only published results are shown. Unpublished scores remain private."} action={<Link href="/student/graduation" className="rounded-lg text-sm font-semibold text-amber-800 underline-offset-4 hover:underline">View Eligibility</Link>}>
        {publishedResult.result ? <div className="grid gap-3 sm:grid-cols-2"><DataCard label="Published Programme Result" value={`${publishedResult.result.total_points} / 100`} detail={humanizeStudentValue(publishedResult.result.result_outcome)} /><DataCard label="Completion Requirements" value={`${completionTracker.rows.filter((row) => ["met", "waived", "not_applicable"].includes(row.tracker.requirement_status)).length} / ${completionTracker.rows.length} resolved`} detail="Final completion requires academic review and institutional approval." /></div> : <div className="grid gap-3 sm:grid-cols-2"><DataCard label="Programme Result" value="Not Yet Published" detail="No unpublished score is displayed." /><DataCard label="Current Requirements" value={completionTracker.rows.length ? `${completionTracker.rows.filter((row) => row.tracker.requirement_status === "met").length} completed` : "Not Yet Assessed"} detail={completionTracker.rows.length ? `${completionTracker.rows.filter((row) => row.tracker.requirement_status === "under_review").length} under review` : "Open the eligibility tracker to review the governing requirements."} /></div>}
      </StudentPanel>

      <StudentPanel title="My REALMS Journey" description="Your discipleship route and practical skill pathway form one integrated School of Discovery programme.">
        <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
          <DataCard label="Discipleship Route" value={routeName} />
          <div aria-hidden="true" className="hidden items-center text-2xl text-amber-600 md:flex">+</div>
          <DataCard label="Skill Pathway" value={pathwayName} detail={`Learning Mode: ${humanizeStudentValue(data.enrollment.skill_learning_mode)}`} />
        </div>
      </StudentPanel>

      <div className="grid gap-6 xl:grid-cols-2">
        <StudentPanel title="Onboarding" description={`Overall onboarding: ${lifecycle.overallOnboarding}`}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DataCard label="Portal Access" value={lifecycle.portalAccess} />
            <DataCard label="Student Handbook" value={lifecycle.handbook} detail={handbookState.acknowledgement ? formatStudentDate(handbookState.acknowledgement.acknowledged_at) : undefined} />
            <DataCard label="Orientation" value={lifecycle.orientation} detail={data.student.orientation_completed_at ? formatStudentDate(data.student.orientation_completed_at) : data.cohort?.orientation_date ? `Scheduled: ${formatStudentDate(data.cohort.orientation_date)}` : undefined} />
            <DataCard label="Matriculation" value={lifecycle.matriculation} detail={data.student.matriculated_at ? formatStudentDate(data.student.matriculated_at) : data.cohort?.matriculation_date ? `Scheduled: ${formatStudentDate(data.cohort.matriculation_date)}` : undefined} />
          </div>
        </StudentPanel>
        <StudentPanel title="Next Actions" description="Based on the learning information currently available.">
          {nextActions.length ? <ul className="space-y-3">{nextActions.map((action) => <li key={`${action.label}-${action.href}`}><Link href={action.href} className="flex gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-[#071327] hover:bg-amber-50"><span aria-hidden="true" className="text-amber-700">→</span>{action.label}</Link></li>)}</ul> : <EmptyState>No academic action is currently required.</EmptyState>}
        </StudentPanel>
      </div>

      {data.todaysSession ? <StudentPanel title="Today&apos;s Activity" className="border-amber-300 bg-amber-50"><div className="grid gap-4 sm:grid-cols-2"><DataCard label="Activity" value={data.todaysSession.title} detail={`${data.todaysSession.courseCode} · ${data.todaysSession.courseTitle}`} /><DataCard label="Start" value={formatStudentTime(data.todaysSession.scheduledStartAt)} detail={humanizeStudentValue(data.todaysSession.deliveryMode)} />{data.todaysSession.deliveryMode === "physical" && data.todaysSession.physicalLocation ? <DataCard label="Location" value={data.todaysSession.physicalLocation} /> : null}</div></StudentPanel> : null}

      <StudentPanel title="My Courses" action={<Link href="/student/courses" className="rounded-lg text-sm font-semibold text-amber-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">View All Courses</Link>}>
        <div className="grid gap-6 lg:grid-cols-2"><div><h3 className="mb-3 font-semibold text-[#071327]">My Discipleship Route</h3><CoursePreview courses={data.discipleshipCourses} /></div><div><h3 className="mb-3 font-semibold text-[#071327]">My Skill Pathway</h3><CoursePreview courses={data.skillCourses} /></div></div>
      </StudentPanel>

      <StudentPanel title="Upcoming Activities">
        {data.upcomingSessions.length ? <ul className="grid gap-3 lg:grid-cols-2">{data.upcomingSessions.map((session) => <SessionCard key={`${session.kind}-${session.id}`} session={session} />)}</ul> : <EmptyState>No upcoming activities have been published yet.</EmptyState>}
      </StudentPanel>

      <div className="grid gap-6 xl:grid-cols-2">
        <StudentPanel title="Recent Class Summaries">
          {data.recentSummaries.length ? <ul className="space-y-3">{data.recentSummaries.map((summary) => <li key={summary.id}><Link href={`/student/sessions/${summary.sessionId}#summary`} className="block rounded-xl border border-slate-200 p-4 transition hover:border-amber-300 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"><p className="text-xs font-semibold tracking-[0.12em] text-amber-700">{summary.courseCode}</p><h3 className="mt-1 font-semibold text-[#071327]">{summary.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{summary.courseTitle} · {formatStudentDate(summary.sessionDate)} · Version {summary.versionNumber}</p></Link></li>)}</ul> : <EmptyState>No class summaries have been published yet.</EmptyState>}
        </StudentPanel>
        <StudentPanel title="Available Recordings">
          {data.availableRecordings.length ? <ul className="space-y-3">{data.availableRecordings.map((recording) => <li key={recording.id}><Link href={`/student/sessions/${recording.sessionId}#recording-${recording.id}`} className="block rounded-xl border border-slate-200 p-4 transition hover:border-amber-300 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"><p className="text-xs font-semibold tracking-[0.12em] text-amber-700">{recording.courseCode}</p><h3 className="mt-1 font-semibold text-[#071327]">{recording.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{recording.courseTitle} · {recording.sessionTitle}{recording.durationSeconds ? ` · ${Math.ceil(recording.durationSeconds / 60)} minutes` : ""}</p></Link></li>)}</ul> : <EmptyState>No class recordings are currently available.</EmptyState>}
        </StudentPanel>
      </div>

      <StudentPanel title="Attendance Snapshot" description={attendance.finalizedCount ? "Attendance reflects finalized records only." : "Attendance records will appear after your required class sessions begin."}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><DataCard label="Present" value={String(attendance.counts.present)} /><DataCard label="Late" value={String(attendance.counts.late)} /><DataCard label="Partial" value={String(attendance.counts.partial)} /><DataCard label="Excused" value={String(attendance.counts.excused_absence)} /><DataCard label="Unexcused" value={String(attendance.counts.absent)} /><DataCard label="Remaining Permitted Attendance Units" value={String(attendance.remainingAbsenceUnits)} /></div>
      </StudentPanel>

      <StudentPanel title="Programme Requirements" description="Successful programme completion requires:">
        <ul className="grid gap-3 text-sm leading-6 text-slate-700 md:grid-cols-2">{["minimum overall programme result", "minimum approved discipleship-route result", "minimum skill-pathway result", "minimum attendance, participation and integrity result", "skill capstone submission and defence", "final discipleship-route assessment", "published attendance and catch-up requirements", "no unresolved serious conduct or academic-integrity case"].map((requirement) => <li key={requirement} className="flex gap-3"><span aria-hidden="true" className="text-amber-700">•</span><span>{requirement}</span></li>)}</ul>
      </StudentPanel>
    </div>
  );
}
