import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { LmsAdminDataError } from "@/lib/lms/adminData";
import { evaluateRecordedLearningAssignment } from "@/lib/lms/recordingService";
import { normalizeViewerEmail, parseZoomEvidenceCsv } from "@/lib/lms/zoomEvidence";

type Actor = { actorUserId?: string | null; actorLabel: "REALMS Admin" };
function relation(value: unknown): Record<string, unknown> { return Array.isArray(value) ? relation(value[0]) : value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function missingTable(error: { code?: string; message?: string } | null) { return Boolean(error && (["42P01", "PGRST205"].includes(error.code ?? "") || /zoom_recording_viewer_evidence/i.test(error.message ?? ""))); }

export async function importZoomViewerEvidence(supabase: SupabaseClient, recordingId: string, csv: string, actor: Actor) {
  const recording = await supabase.from("class_recordings").select("id, provider, external_recording_id").eq("id", recordingId).maybeSingle();
  if (recording.error || !recording.data) throw new LmsAdminDataError("Recording not found.", 404);
  if (recording.data.provider !== "zoom") throw new LmsAdminDataError("Zoom viewer evidence can be imported only for a Zoom cloud recording.", 409);
  let rows; try { rows = parseZoomEvidenceCsv(csv); } catch (error) { throw new LmsAdminDataError(error instanceof Error ? error.message : "The Zoom evidence CSV is invalid.", 400); }
  const assignments = await supabase.from("recording_learning_assignments").select("id, purpose_code, course_enrollment_id, course_enrollments(id, student_enrollments(students(id, email)))").eq("class_recording_id", recordingId).in("purpose_code", ["RP", "DR-E", "MU-E", "MU-U"]);
  if (assignments.error) throw new LmsAdminDataError("Eligible Zoom recording assignments could not be loaded.");
  const byEmail = new Map<string, Array<{ assignmentId: string; enrollmentId: string; studentId: string }>>();
  for (const assignment of assignments.data ?? []) {
    const enrollment = relation(assignment.course_enrollments); const student = relation(relation(enrollment.student_enrollments).students); const email = normalizeViewerEmail(student.email);
    if (!email || !student.id) continue;
    byEmail.set(email, [...(byEmail.get(email) ?? []), { assignmentId: String(assignment.id), enrollmentId: String(assignment.course_enrollment_id), studentId: String(student.id) }]);
  }
  let imported = 0, duplicates = 0, matched = 0, unmatched = 0;
  for (const row of rows) {
    const candidates = byEmail.get(row.viewerEmail) ?? []; const match = candidates.length === 1 ? candidates[0] : null;
    const identifier = row.recordingIdentifier ?? recording.data.external_recording_id ?? recordingId;
    const sourceHash = createHash("sha256").update(JSON.stringify([recordingId, identifier, row.viewerEmail, row.viewedAt, row.reportedDurationSeconds, row.viewerName])).digest("hex");
    const inserted = await supabase.from("zoom_recording_viewer_evidence").insert({ class_recording_id: recordingId, zoom_recording_identifier: identifier, viewer_name: row.viewerName, viewer_email: row.viewerEmail, viewed_at: row.viewedAt, zoom_reported_view_duration_seconds: row.reportedDurationSeconds, source_hash: sourceHash, evidence_status: match ? "matched" : "unmatched", matched_student_id: match?.studentId ?? null, matched_course_enrollment_id: match?.enrollmentId ?? null, matched_recording_assignment_id: match?.assignmentId ?? null, raw_source: row.raw, imported_by: actor.actorUserId ?? actor.actorLabel }).select("id").single();
    if (inserted.error?.code === "23505") { duplicates += 1; continue; }
    if (missingTable(inserted.error)) throw new LmsAdminDataError("Apply the Zoom viewing-evidence migration before importing CSV evidence.", 503);
    if (inserted.error) throw new LmsAdminDataError("Zoom viewing evidence could not be imported.");
    imported += 1; if (match) matched += 1; else unmatched += 1;
  }
  await recordLmsAudit(supabase, { action: "zoom_viewing_evidence_imported", entityType: "class_recording", entityId: recordingId, actorUserId: actor.actorUserId, metadata: { imported, duplicates, matched, unmatched, matching_basis: "registered_email", duration_semantics: "zoom_reported_view_duration" } });
  return { imported, duplicates, matched, unmatched };
}

export async function reviewZoomViewerEvidence(supabase: SupabaseClient, assignmentId: string, evidenceId: string, decision: "verify" | "reject", note: string, actor: Actor) {
  if (!note.trim()) throw new LmsAdminDataError("A Zoom evidence review note is required.", 400);
  const [evidence, requirementRows] = await Promise.all([
    supabase.from("zoom_recording_viewer_evidence").select("*").eq("id", evidenceId).eq("matched_recording_assignment_id", assignmentId).eq("evidence_status", "matched").maybeSingle(),
    supabase.from("recording_requirement_statuses").select("requirement_type, is_required").eq("recording_assignment_id", assignmentId),
  ]);
  if (missingTable(evidence.error)) throw new LmsAdminDataError("Apply the Zoom viewing-evidence migration before reviewing evidence.", 503);
  if (evidence.error || requirementRows.error || !evidence.data) throw new LmsAdminDataError("Matched Zoom viewer evidence was not found for this assignment.", 404);
  if (decision === "verify" && !(requirementRows.data ?? []).some((row) => row.is_required && row.requirement_type !== "watch")) throw new LmsAdminDataError("Zoom viewing evidence cannot verify official learning by itself. Configure at least one required REALMS learning check.", 409);
  const now = new Date().toISOString(); const status = decision === "verify" ? "verified" : "rejected";
  const saved = await supabase.from("zoom_recording_viewer_evidence").update({ evidence_status: status, reviewed_by: actor.actorUserId ?? actor.actorLabel, review_note: note.trim().slice(0, 2000), reviewed_at: now, updated_at: now }).eq("id", evidenceId).eq("matched_recording_assignment_id", assignmentId).select("id").single();
  if (saved.error) throw new LmsAdminDataError("Zoom viewing evidence review could not be saved.");
  if (decision === "verify") {
    const watch = await supabase.from("recording_requirement_statuses").update({ requirement_status: "satisfied", evidence_source: "zoom_viewing_evidence_staff_verified", evidence_reference: evidenceId, completed_at: now, verified_at: now, verified_by: actor.actorUserId ?? actor.actorLabel, verification_note: note.trim().slice(0, 2000), updated_at: now }).eq("recording_assignment_id", assignmentId).eq("requirement_type", "watch").eq("is_required", true).select("id");
    if (watch.error || !watch.data?.length) throw new LmsAdminDataError("The assignment does not have a required watch-evidence record.", 409);
  }
  await recordLmsAudit(supabase, { action: decision === "verify" ? "zoom_viewing_evidence_verified" : "zoom_viewing_evidence_rejected", entityType: "recording_learning_assignment", entityId: assignmentId, actorUserId: actor.actorUserId, metadata: { zoom_evidence_id: evidenceId, reported_duration_not_unique_watch: true } });
  return evaluateRecordedLearningAssignment(supabase, assignmentId, actor);
}

export async function fetchZoomEvidence(supabase: SupabaseClient, assignmentId?: string) {
  let query = supabase.from("zoom_recording_viewer_evidence").select("*").order("created_at", { ascending: false }).limit(500);
  if (assignmentId) query = query.eq("matched_recording_assignment_id", assignmentId);
  const result = await query;
  if (missingTable(result.error)) return { rows: [], migrationRequired: true };
  if (result.error) throw new LmsAdminDataError("Zoom viewing evidence could not be loaded.");
  return { rows: result.data ?? [], migrationRequired: false };
}

export async function reconcileZoomViewerEvidence(supabase: SupabaseClient, recordingId: string, actor: Actor) {
  const [unmatched, assignments] = await Promise.all([
    supabase.from("zoom_recording_viewer_evidence").select("id, viewer_email").eq("class_recording_id", recordingId).eq("evidence_status", "unmatched"),
    supabase.from("recording_learning_assignments").select("id, course_enrollment_id, course_enrollments(student_enrollments(students(id, email)))").eq("class_recording_id", recordingId).in("purpose_code", ["RP", "DR-E", "MU-E", "MU-U"]),
  ]);
  if (missingTable(unmatched.error)) throw new LmsAdminDataError("Apply the Zoom viewing-evidence migration before reconciling evidence.", 503);
  if (unmatched.error || assignments.error) throw new LmsAdminDataError("Zoom viewing evidence could not be reconciled.");
  const byEmail = new Map<string, Array<{ assignmentId: string; enrollmentId: string; studentId: string }>>();
  for (const assignment of assignments.data ?? []) { const enrollment = relation(assignment.course_enrollments); const student = relation(relation(enrollment.student_enrollments).students); const email = normalizeViewerEmail(student.email); if (email && student.id) byEmail.set(email, [...(byEmail.get(email) ?? []), { assignmentId: String(assignment.id), enrollmentId: String(assignment.course_enrollment_id), studentId: String(student.id) }]); }
  let matched = 0;
  for (const row of unmatched.data ?? []) { const candidates = byEmail.get(normalizeViewerEmail(row.viewer_email)) ?? []; if (candidates.length !== 1) continue; const match = candidates[0]; const saved = await supabase.from("zoom_recording_viewer_evidence").update({ evidence_status: "matched", matched_student_id: match.studentId, matched_course_enrollment_id: match.enrollmentId, matched_recording_assignment_id: match.assignmentId, updated_at: new Date().toISOString() }).eq("id", row.id).eq("evidence_status", "unmatched"); if (saved.error) throw new LmsAdminDataError("A Zoom viewer record could not be reconciled."); matched += 1; }
  await recordLmsAudit(supabase, { action: "zoom_viewing_evidence_imported", entityType: "class_recording", entityId: recordingId, actorUserId: actor.actorUserId, metadata: { reconciled: matched, matching_basis: "registered_email" } });
  return { matched, remaining: (unmatched.data?.length ?? 0) - matched };
}
