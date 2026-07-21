import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState, humanizeStudentValue, PageHeading, StudentPanel } from "@/components/student/StudentUi";
import { getStudentCourses, type LearningCourse } from "@/lib/lms/studentLearning";

export const metadata: Metadata = { title: "My Courses | REALMS Institute" };

function CourseList({ courses }: { courses: LearningCourse[] }) {
  if (!courses.length) return <EmptyState>Your course enrolment is still being prepared. Please contact REALMS Institute if this persists.</EmptyState>;
  return <ul className="grid gap-5 lg:grid-cols-2">{courses.map((course) => <li key={course.courseEnrollmentId} className="flex h-full flex-col rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold tracking-[0.13em] text-amber-700">{course.code}</p><h3 className="mt-2 text-xl font-semibold leading-7 text-[#071327]">{course.title}</h3></div><span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{course.categoryLabel}</span></div><dl className="mt-5 space-y-2 text-sm"><div className="flex justify-between gap-4"><dt className="text-slate-500">Programme Component</dt><dd className="text-right font-medium text-slate-800">{course.componentLabel}</dd></div>{course.facilitators.length ? <div className="flex justify-between gap-4"><dt className="text-slate-500">Facilitator</dt><dd className="text-right font-medium text-slate-800">{course.facilitators.join(", ")}</dd></div> : null}{course.deliveryWeek ? <div className="flex justify-between gap-4"><dt className="text-slate-500">Delivery Week</dt><dd className="text-right font-medium text-slate-800">{course.deliveryWeek}</dd></div> : null}{course.deliveryMode ? <div className="flex justify-between gap-4"><dt className="text-slate-500">Delivery Mode</dt><dd className="text-right font-medium text-slate-800">{humanizeStudentValue(course.deliveryMode)}</dd></div> : null}{course.schedule ? <div className="flex justify-between gap-4"><dt className="text-slate-500">Schedule</dt><dd className="max-w-[65%] text-right font-medium text-slate-800">{course.schedule}</dd></div> : null}</dl><div className="mt-5 grid grid-cols-3 gap-2 border-t border-slate-200 pt-4 text-center"><Count value={course.sessionCount} label="Class Sessions" /><Count value={course.summaryCount} label="Summaries Published" /><Count value={course.recordingCount} label="Recordings Available" /></div>{course.isCapstone ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">Capstone submission and assessment features will become available in the Assessments area.</p> : null}<Link href={`/student/courses/${course.courseEnrollmentId}`} className="mt-5 inline-flex min-h-11 items-center justify-center self-start rounded-xl bg-[#0b315c] px-5 py-2 text-sm font-semibold text-white hover:bg-[#124574] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">Open Course</Link></li>)}</ul>;
}

function Count({ value, label }: { value: number; label: string }) {
  return <div><p className="text-lg font-semibold text-[#071327]">{value}</p><p className="mt-1 text-[0.68rem] leading-4 text-slate-500">{label}</p></div>;
}

export default async function StudentCoursesPage() {
  const courses = await getStudentCourses();
  const discipleship = courses.filter((course) => course.category === "discipleship");
  const skills = courses.filter((course) => course.category === "skill");
  const discipleshipTitle = discipleship[0]?.discipleshipRoute === "advanced" ? "My Advanced Discipleship Programme" : "My Foundational Discipleship Programme";
  const skillTitle = skills[0]?.skillPathway === "cybersecurity_foundations" ? "My Cybersecurity Foundations Pathway" : "My Web Development Pathway";
  return <><PageHeading eyebrow="Student Portal" title="My Courses" description="Only the courses in your approved discipleship route and selected practical skill pathway are shown here." /><div className="space-y-6"><StudentPanel title={discipleshipTitle}><CourseList courses={discipleship} /></StudentPanel><StudentPanel title={skillTitle}><CourseList courses={skills} /></StudentPanel></div></>;
}

