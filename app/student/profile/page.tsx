import type { Metadata } from "next";

import { StudentProfileForm } from "@/components/student/StudentProfileForm";
import { DataCard, humanizeStudentValue, PageHeading, StudentPanel } from "@/components/student/StudentUi";
import { requireRole } from "@/lib/lms/auth";
import { getStudentDashboardData } from "@/lib/lms/studentDashboard";

export const metadata: Metadata = { title: "My Profile | REALMS Institute" };

export default async function StudentProfilePage() {
  const { user } = await requireRole("student");
  const data = await getStudentDashboardData(user.id);
  if (!data.student || !data.enrollment) return null;
  const route = data.enrollment.discipleship_route === "advanced" ? "Advanced Discipleship Programme" : "Foundational Discipleship Programme";
  const skill = data.enrollment.skill_pathway === "web_development" ? "Web Development" : "Cybersecurity Foundations";
  return <><PageHeading eyebrow="Student Portal" title="My Profile" description="Review your institutional record and maintain the limited personal details that you control." /><div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]"><div className="space-y-6"><StudentPanel title="Identity"><div className="grid gap-3 sm:grid-cols-2"><DataCard label="Student ID" value={data.student.student_number} /><DataCard label="Legal Name" value={data.student.legal_name} detail="Contact REALMS Institute to request a correction." /><DataCard label="Preferred Name" value={data.profile?.preferred_name || data.student.preferred_name || "Not set"} /><DataCard label="Email" value={data.student.email} /><DataCard label="Phone" value={data.profile?.phone || data.student.phone || "Not set"} /><DataCard label="Country" value={data.student.country || "Not set"} /><DataCard label="City" value={data.student.city || "Not set"} /></div></StudentPanel><StudentPanel title="Programme Record"><div className="grid gap-3 sm:grid-cols-2"><DataCard label="Cohort" value={data.cohort?.name ?? "Not assigned"} /><DataCard label="Discipleship Route" value={route} /><DataCard label="Skill Pathway" value={skill} /><DataCard label="Learning Mode" value={humanizeStudentValue(data.enrollment.skill_learning_mode)} /><DataCard label="Student Status" value={data.academicStatus} /><DataCard label="Onboarding Status" value={humanizeStudentValue(data.student.onboarding_status)} /></div></StudentPanel></div><StudentPanel title="Personal Details" description="You may update only your preferred name, phone number, and profile image URL."><StudentProfileForm preferredName={data.profile?.preferred_name ?? ""} phone={data.profile?.phone ?? data.student.phone ?? ""} avatarUrl={data.profile?.avatar_url ?? ""} /></StudentPanel></div></>;
}

