import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
import { archivePublishedSummary } from "@/lib/lms/graduationService";
import { transitionClassSummary, type ClassSummaryTransition } from "@/lib/lms/sessionService";

const adminActions = ["request_changes", "approve", "publish", "archive", "create_amendment"] as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const [{ id }, body] = await Promise.all([params, readJsonObject(request)]);
  if (!isUuid(id) || !body || !(adminActions as readonly unknown[]).includes(body.action)) return NextResponse.json({ message: "A valid class-summary review action is required." }, { status: 400 });
  try {
    const supabase = requireLmsAdminClient();
    const summary = await transitionClassSummary(supabase, id, body.action as ClassSummaryTransition, body, { actorLabel: "REALMS Admin" });
    if (body.action === "publish") {
      const session = await supabase.from("class_sessions").select("id, title, scheduled_start_at, cohort_course_id").eq("id", String(summary.class_session_id)).single();
      if (session.error) throw new LmsAdminDataError("The published summary's class session could not be loaded.");
      const archives = await supabase.from("alumni_course_archives").select("*").eq("cohort_course_id", session.data.cohort_course_id).eq("archive_status", "active");
      if (archives.error) throw new LmsAdminDataError("Eligible alumni archives could not be loaded for the published summary.");
      for (const archive of archives.data ?? []) await archivePublishedSummary(supabase, archive, session.data, summary, { actorLabel: "REALMS Admin" });
    }
    return NextResponse.json({ summary });
  } catch (error) { return lmsApiError(error, "Class-summary review action could not be completed."); }
}
