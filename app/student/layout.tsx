import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { StudentPortalShell } from "@/components/student/StudentPortalShell";
import { requireRole } from "@/lib/lms/auth";
import { getStudentDashboardData, StudentDashboardDataError, type StudentDashboardData } from "@/lib/lms/studentDashboard";
import { getStudentHandbookState } from "@/lib/lms/studentHandbook";

export const dynamic = "force-dynamic";

const fallbackData: StudentDashboardData = { profile: null, student: null, enrollment: null, cohort: null, greeting: "Welcome", displayName: "Student", academicStatus: "Not available", discipleshipCourses: [], skillCourses: [], sessions: [], upcomingSessions: [], pastSessions: [], todaysSession: null, recentSummaries: [], availableRecordings: [], resources: [] };

async function loadLayoutData(profileId: string) {
  try {
    return { data: await getStudentDashboardData(profileId), failed: false };
  } catch (error) {
    if (!(error instanceof StudentDashboardDataError)) console.error("Student portal layout failed", error instanceof Error ? { name: error.name, message: error.message } : { name: "UnknownError" });
    return { data: fallbackData, failed: true };
  }
}

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const { user, roles } = await requireRole("student");
  const { data, failed } = await loadLayoutData(user.id);
  if (failed) return <StudentPortalShell data={data}><div className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm"><h1 className="text-2xl font-semibold text-[#071327]">Dashboard temporarily unavailable</h1><p className="mt-3 leading-7 text-slate-700">We could not load part of your learning dashboard right now. Please refresh the page or contact REALMS Institute if the issue continues.</p></div></StudentPortalShell>;
  if (!data.student) return <StudentPortalShell data={data}><div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm"><h1 className="text-2xl font-semibold text-[#071327]">Student account activation</h1><p className="mt-3 leading-7 text-slate-700">Your student account has not yet been fully activated. Please contact REALMS Institute.</p></div></StudentPortalShell>;
  if (!data.enrollment) return <StudentPortalShell data={data}><div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm"><h1 className="text-2xl font-semibold text-[#071327]">Course enrolment in progress</h1><p className="mt-3 leading-7 text-slate-700">Your course enrolment is still being prepared. Please contact REALMS Institute if this persists.</p></div></StudentPortalShell>;
  if (data.enrollment.enrolment_status === "completed" && roles.includes("alumni")) redirect("/alumni");
  const handbook = await getStudentHandbookState(user.id);
  return <StudentPortalShell data={data} handbookAcknowledged={handbook.acknowledged}>{children}</StudentPortalShell>;
}
