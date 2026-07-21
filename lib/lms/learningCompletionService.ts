import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { LmsAdminDataError } from "@/lib/lms/adminData";

type Actor = { actorUserId?: string | null; actorLabel: "REALMS Admin" | "Facilitator" | "Student" | "System" };
function actorReference(actor: Actor) { return actor.actorUserId ?? actor.actorLabel; }

export async function setLearningCompletionState(supabase: SupabaseClient, input: {
  learningCompletionId: string;
  status: string;
  method?: string | null;
  reason: string;
  actor: Actor;
}) {
  const current = await supabase.from("session_learning_completion").select("*").eq("id", input.learningCompletionId).maybeSingle();
  if (current.error || !current.data) throw new LmsAdminDataError("Learning-completion record could not be loaded.");
  const next = {
    completion_status: input.status,
    completion_method: input.method === undefined ? current.data.completion_method : input.method,
    completed_at: ["verified_complete", "late_complete"].includes(input.status) ? current.data.completed_at ?? new Date().toISOString() : null,
    verified_at: ["verified_complete", "late_complete"].includes(input.status) ? new Date().toISOString() : null,
    verified_by: ["verified_complete", "late_complete"].includes(input.status) ? actorReference(input.actor) : null,
    updated_at: new Date().toISOString(),
  };
  if (current.data.completion_status === next.completion_status && current.data.completion_method === next.completion_method) return current.data;
  const event = await supabase.from("learning_completion_change_events").insert({ learning_completion_id: input.learningCompletionId, change_type: "completion_status_changed", previous_state: { completion_status: current.data.completion_status, completion_method: current.data.completion_method }, new_state: next, reason: input.reason, changed_by: actorReference(input.actor) });
  if (event.error) throw new LmsAdminDataError("Learning-completion history could not be preserved.");
  const saved = await supabase.from("session_learning_completion").update(next).eq("id", input.learningCompletionId).select("*").single();
  if (saved.error) throw new LmsAdminDataError("Learning-completion status could not be saved.");
  return saved.data;
}

export async function syncLiveLearningCompletionFromAttendance(supabase: SupabaseClient, attendanceId: string, actor: Actor) {
  const attendance = await supabase.from("session_attendance").select("id, course_enrollment_id, class_session_id, attendance_status, integrity_flag, finalized_at").eq("id", attendanceId).maybeSingle();
  if (attendance.error || !attendance.data) throw new LmsAdminDataError("Attendance record could not be loaded.");
  if (!attendance.data.finalized_at) throw new LmsAdminDataError("Attendance must be finalized before live learning completion can be synchronized.", 409);
  const completion = await supabase.from("session_learning_completion").select("id").eq("course_enrollment_id", attendance.data.course_enrollment_id).eq("class_session_id", attendance.data.class_session_id).maybeSingle();
  if (completion.error || !completion.data) throw new LmsAdminDataError("The separate learning-completion record is missing.", 409);
  const state = attendance.data.integrity_flag
    ? { status: "integrity_review", method: "live" }
    : attendance.data.attendance_status === "present" || attendance.data.attendance_status === "late"
      ? { status: "verified_complete", method: "live" }
      : attendance.data.attendance_status === "not_verified"
        ? { status: "under_review", method: "live" }
        : attendance.data.attendance_status === "partial"
          ? { status: "makeup_required", method: "live" }
          : attendance.data.attendance_status === "excused_absence" || attendance.data.attendance_status === "absent"
            ? { status: "makeup_required", method: null }
            : { status: "in_progress", method: "live" };
  const saved = await setLearningCompletionState(supabase, { learningCompletionId: completion.data.id, ...state, reason: `Synchronized from finalized ${attendance.data.attendance_status} live attendance.`, actor });
  await recordLmsAudit(supabase, { action: "learning_completion_synced", entityType: "session_learning_completion", entityId: completion.data.id, actorUserId: actor.actorUserId, metadata: { attendance_id: attendanceId, attendance_status: attendance.data.attendance_status, learning_status: saved.completion_status } });
  return saved;
}
