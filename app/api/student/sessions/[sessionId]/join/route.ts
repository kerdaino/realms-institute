import { NextResponse } from "next/server";

import { getCurrentUser, getCurrentUserRoles } from "@/lib/lms/auth";
import { getStudentLiveClassTarget, StudentLearningDataError } from "@/lib/lms/studentLearning";
import { recordStudentMeaningfulActivity } from "@/lib/lms/engagementService";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Please sign in to access this class." }, { status: 401 });
  if (!(await getCurrentUserRoles()).includes("student")) return NextResponse.json({ message: "You do not have access to this class." }, { status: 403 });
  const { sessionId } = await params;
  try {
    const target = await getStudentLiveClassTarget(sessionId);
    if (!target) return NextResponse.json({ message: "Live class access is not available for this session." }, { status: 403 });
    const admin = getSupabaseAdmin(); if (admin) await recordStudentMeaningfulActivity(admin, user.id);
    return NextResponse.redirect(target);
  } catch (error) {
    if (!(error instanceof StudentLearningDataError)) console.error("Student live class access failed", error instanceof Error ? { name: error.name, message: error.message } : { name: "UnknownError" });
    return NextResponse.json({ message: "Live class access could not be opened right now." }, { status: 500 });
  }
}
