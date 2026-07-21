import Link from "next/link";
import { NewAbsenceRequestForm } from "@/components/student/AbsenceRequestForms";
import { getStudentAbsenceSessionOptions } from "@/lib/lms/absenceData";
import { requireRole } from "@/lib/lms/auth";
export default async function NewAbsencePage() { const { user } = await requireRole("student"); const sessions = await getStudentAbsenceSessionOptions(user.id); return <div className="mx-auto max-w-3xl space-y-5"><Link href="/student/absences" className="font-semibold text-amber-800">← Absence &amp; Make-Up</Link><header><h1 className="text-3xl font-semibold text-[#071327]">Report an Absence</h1><p className="mt-2 leading-7 text-slate-600">Share only what is necessary for fair review. Supporting evidence is optional unless your cohort policy or an authorised reviewer asks for it.</p></header><NewAbsenceRequestForm sessions={sessions} /></div>; }
