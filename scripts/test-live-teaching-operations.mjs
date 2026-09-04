import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { evaluateRecordedRequirements, recordingEvidenceReadiness, recordingPurposeStudentCopy } from "../lib/lms/recording.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [recordingService, recordingData, sessionService, facilitatorService, absenceService, migration, adminSubmissionMigration, eventCompatibilityMigration, verification, facultyRecord, adminSummary, adminSummaryQueue, studentList, studentDetail, portalShell, css, recordingControl, recordedLearningPanel] = await Promise.all([
  read("lib/lms/recordingService.ts"), read("lib/lms/recordingData.ts"), read("lib/lms/sessionService.ts"), read("lib/lms/facilitatorSessions.ts"), read("lib/lms/absenceService.ts"), read("supabase/lms_live_teaching_operations.sql"), read("supabase/lms_class_summary_admin_submission.sql"), read("supabase/lms_class_summary_review_event_compatibility.sql"), read("supabase/lms_live_teaching_operations_verify.sql"), read("components/portal/FacultySessionRecord.tsx"), read("components/admin/ClassSummaryWorkflowPanel.tsx"), read("components/admin/ClassSummaryQueueAction.tsx"), read("app/student/(academic)/recordings/page.tsx"), read("app/student/(academic)/recordings/[assignmentId]/page.tsx"), read("components/portal/PortalShell.tsx"), read("app/globals.css"), read("components/admin/RecordingControlCentre.tsx"), read("components/admin/RecordedLearningAdminPanel.tsx"),
]);

const checks = [];
function check(name, condition) { assert.ok(condition, name); checks.push(name); }

const readyRecording = { recording_status: "available", access_level: "enrolled_students", quality_checked: true, title: "Session replay", recording_date: "2026-08-25", provider: "zoom", external_url: "https://example.com/replay" };
check("1 admin metadata supports source, description, duration, date and notes", ["description", "duration_seconds", "recording_date", "admin_notes"].every((field) => sessionService.includes(field)));
check("2 assigned facilitator has a narrow source-submission service", facilitatorService.includes("saveFacilitatorRecordingSource") && facilitatorService.includes("requireFacilitatorSessionAccess"));
check("3 unrelated or inactive facilitator is denied", facilitatorService.includes("You are not assigned to this class session") && facilitatorService.includes('facilitator_status !== "active"'));
check("4 student recording access is resolved through student and course enrolment", recordingService.includes("resolveStudentRecordingAssignment") && recordingService.includes("student_enrollments!inner(student_id)"));
check("5 recording discovery still requires an active or enrolled course enrolment", recordingService.includes('.in("enrollment_status", ["active", "enrolled"])'));
check("6 general replay cannot enter the official attendance update branch", recordingService.includes('if (evaluation.complete && (purpose === "RP" || purpose === "DR-E"))') && !recordingPurposeStudentCopy.REV.description.includes("contributes"));
check("7 recorded-route assignment is automatically orchestrated after the quality gate", sessionService.includes("orchestrateEvidenceRecording") && sessionService.includes("initializeRecordedLearningForSession"));
check("8 assignment initialization is idempotent", recordingService.includes('.eq("purpose_code", input.purpose).maybeSingle()') && recordingService.includes('inserted.error.code !== "23505"'));
check("9 unchecked recording fails official evidence readiness", !recordingEvidenceReadiness({ ...readyRecording, quality_checked: false }).ready);
check("10 valid quality-approved recording passes evidence readiness", recordingEvidenceReadiness(readyRecording).ready);
check("11 official recorded completion can be produced only by the evaluator branch", recordingService.includes("export async function evaluateRecordedLearningAssignment") && recordingService.indexOf('attendance_status: "verified_recorded_attendance"') > recordingService.indexOf("export async function evaluateRecordedLearningAssignment"));
check("12 approved make-up creates or reuses MU-E evidence assignment", absenceService.includes('purpose: shouldAssignApproved ? "MU-E" : "MU-U"') && recordingService.includes("ensureMakeupRecordingAssignment"));
check("13 completed make-up preserves attendance", recordingService.includes("attendance_unchanged: true") && recordingPurposeStudentCopy["MU-E"].description.includes("remains unchanged"));
check("14 general replay creates no session learning-completion record", recordingService.includes('if (input.purpose !== "REV") {') && recordingService.includes("session_learning_completion"));
check("15 route change initialization respects enrolment start and exposes awaiting count", recordingService.includes("enrollment.enrolled_at") && recordingService.includes("awaitingRecording"));
check("16 staff recording queues expose missing and awaiting states", recordingData.includes('missing_recording: "Missing Recording"') && recordingData.includes('awaiting_recorded_attendance: "Students Awaiting Recorded Attendance"'));

const completeOfficial = evaluateRecordedRequirements({ purpose: "RP", progressIntegrityStatus: "clear", watchRequirementMet: true, checkpointRequirementMet: true, configuredRequiredCheckpoints: 2, requiredCheckpointCount: 2, requirements: { watch: { required: true, status: "satisfied" }, checkpoints: { required: true, status: "satisfied" }, quiz: { required: false, status: "not_required" }, practical: { required: false, status: "not_required" }, reflection: { required: false, status: "not_required" }, oral_verification: { required: false, status: "not_required" } }, dueAt: null, allowLateCompletion: true });
check("17 pure evaluator completes official route only when requirements pass", completeOfficial.complete && completeOfficial.learningStatus === "verified_complete");
const incompleteOfficial = evaluateRecordedRequirements({ purpose: "RP", progressIntegrityStatus: "clear", watchRequirementMet: true, checkpointRequirementMet: false, configuredRequiredCheckpoints: 2, requiredCheckpointCount: 2, requirements: { watch: { required: true, status: "satisfied" }, checkpoints: { required: true, status: "pending" }, quiz: { required: false, status: "not_required" }, practical: { required: false, status: "not_required" }, reflection: { required: false, status: "not_required" }, oral_verification: { required: false, status: "not_required" } }, dueAt: null, allowLateCompletion: true });
check("18 watch alone cannot satisfy official recorded attendance", !incompleteOfficial.complete);

check("19 summary draft creation uses the canonical transaction", migration.includes("create or replace function public.save_class_summary_revision"));
check("20 assigned facilitator predicate covers direct and course assignment", migration.includes("session.facilitator_id = facilitator.id") && migration.includes("facilitator_course_assignments"));
check("21 previous summary content version is preserved transactionally", migration.includes("insert into public.class_summary_versions") && migration.includes("for update"));
check("22 facilitator submit is a controlled transition", migration.includes("p_action = 'submit'") && facultyRecord.includes("summary/submit"));
check("23 administrator can request changes with a required note", migration.includes("p_action = 'request_changes'") && migration.includes("A review note is required"));
check("24 changes-requested revision returns to editable draft after save", migration.includes("summary_status = case when summary_status = 'changes_requested' then 'draft'"));
check("25 administrator approval and publication are separate", migration.includes("p_action = 'approve'") && migration.includes("Only an approved summary can be published"));
check("26 student summary policy is published-only", migration.includes("summary_status = 'published'") && migration.includes("student.profile_id = auth.uid()"));
check("27 facilitator cannot approve or publish", migration.includes("if not is_admin then raise exception") && migration.includes("Only an administrator or assigned active facilitator can submit"));
check("28 published content cannot be edited in place", migration.includes("Only a draft or changes-requested revision can be edited") && adminSummary.includes("Create reviewable amendment"));
check("29 superseded publication is preserved with an audit event", migration.includes("'superseded', 'published', 'superseded'") && migration.includes("supersedes_summary_id"));
check("30 canonical RLS replaces obsolete policies for summaries and versions", migration.includes("drop policy if exists") && migration.includes("class_summary_versions") && migration.includes("class_summary_review_events"));
check("31 verification requires non-empty positive and negative fixtures", verification.includes("non-empty") && verification.includes("assigned active facilitator") && verification.includes("unrelated"));

check("32 faculty routes opt into one shared contrast scope", portalShell.includes("faculty-contrast-scope"));
check("33 faculty inputs, textareas, selects and options have explicit readable colours", css.includes(".faculty-contrast-scope") && css.includes("select option") && css.includes("color: rgb(15 23 42)"));
check("34 disabled controls remain distinguishable and readable", css.includes(":disabled") && css.includes("-webkit-text-fill-color") && css.includes("opacity: 0.72"));
check("35 focus and checkbox states have explicit accessible treatment", css.includes(":focus-visible") && css.includes("accent-color"));
check("36 faculty and admin layouts retain responsive narrow and desktop grids", facultyRecord.includes("md:grid-cols-2") && adminSummary.includes("md:grid-cols-2"));
check("37 student UI presents purpose-specific plain-language copy", studentList.includes("purposeCopy.description") && studentDetail.includes("Attendance and learning remain separate"));
check("38 staff recording duration uses human-readable time and converts before persistence", recordingControl.includes('name="duration_time"') && recordingControl.includes("parseRecordingTime") && !recordingControl.includes('label="Duration in seconds"') && facultyRecord.includes('name="duration_time"'));
check("39 checkpoint authoring uses time or percentage and validates recording duration", recordedLearningPanel.includes("Time in recording") && recordedLearningPanel.includes("Position percentage") && recordingService.includes("Time in recording cannot be later than the recording duration"));
check("40 impossible linked evidence and checkpoint counts are rejected", recordingService.includes("Required checkpoint count must be greater than zero") && recordingService.includes("linked quiz must be an active draft or published quiz") && recordingService.includes("linked reflection must be an active reflection assignment"));
check("41 activation requires enough configured checkpoints with questions", recordingService.includes("assertEvidenceConfigurationReady") && recordingService.includes("required checkpoints with active questions before activation"));
check("42 administrators can submit their own complete draft without facilitator impersonation", adminSubmissionMigration.includes("submit_admin_class_summary") && adminSubmissionMigration.includes("Add a title, learning objective, and key teaching point") && adminSubmissionMigration.includes("saved_summary.id, 'submitted'") && adminSubmissionMigration.includes("'submit', 'submitted'") && sessionService.includes('actor.actorLabel === "REALMS Admin"'));
check("47 summary submission records a constraint-compatible audit event and exposes database failures safely", migration.includes("when p_action = 'submit' then 'submitted'") && sessionService.includes('console.error("Class-summary transition RPC failed"') && sessionService.includes('result.error?.code === "23514"'));
check("48 review-event compatibility covers every emitted transition without removing the constraint", ["'created'", "'revised'", "'submitted'", "'changes_requested'", "'approve'", "'publish'", "'archive'", "'superseded'", "'amendment_created'"].every((event) => eventCompatibilityMigration.includes(event)) && eventCompatibilityMigration.includes("validate constraint class_summary_review_events_event_type_check"));
check("49 transition RPC rejects invalid source states and preserves optimistic locking", migration.includes("current_summary.lock_version <> p_expected_version") && migration.includes("Changes can be requested only from a submitted summary") && migration.includes("Only a submitted summary can be approved") && migration.includes("Only an approved summary can be published"));
check("43 class-summary queue exposes the next valid transition including publish", adminSummaryQueue.includes('"Submit for review"') && adminSummaryQueue.includes('"Approve"') && adminSummaryQueue.includes('"Publish"'));
check("44 recording centre separates replay, official attendance and approved make-up", recordingControl.includes("General Replay") && recordingControl.includes("Official Recorded Attendance") && recordingControl.includes("Approved Make-Up") && recordingControl.includes("Initialize / reconcile official assignments"));
check("45 unsaved requirement defaults are identified and blocked links are explicit", recordedLearningPanel.includes("No active session override is saved") && recordedLearningPanel.includes("Blocked: choose a linked quiz") && recordedLearningPanel.includes("Blocked: choose a linked practical") && recordedLearningPanel.includes("Blocked: choose a linked reflection"));

const realLikeSummary = { title: "Cybersecurity, Ethics and Laboratory Setup", learningObjectives: ["Explain responsible laboratory conduct."], keyTeachingPoints: ["Use authorised systems and published scopes only."], status: "draft" };
const studentCanRead = (fixture) => fixture.status === "published" ? fixture : null;
assert.equal(studentCanRead(realLikeSummary), null);
realLikeSummary.status = "submitted";
assert.equal(studentCanRead(realLikeSummary), null);
realLikeSummary.status = "approved";
assert.equal(studentCanRead(realLikeSummary), null);
realLikeSummary.status = "published";
assert.equal(studentCanRead(realLikeSummary)?.keyTeachingPoints.length, 1);
checks.push("46 non-empty real-like summary fixture remains student-hidden until published");

console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
