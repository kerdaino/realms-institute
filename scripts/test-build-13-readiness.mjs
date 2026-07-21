import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createClient } from "@supabase/supabase-js";
import { resolveRecordingRequirementSnapshot } from "../lib/lms/recording.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const sql = await read("supabase/lms_build_13_readiness_patch.sql");
assert.match(sql, /drop policy if exists "authenticated users read course catalogue" on public\.courses/);
assert.match(sql, /drop policy if exists "authenticated users read cohort course catalogue" on public\.cohort_courses/);
assert.match(sql, /create policy "students read enrolled courses"/);
assert.match(sql, /create policy "students read enrolled cohort courses"/);
assert.match(sql, /current_student_enrolled_in_course\(id\)/);
assert.match(sql, /current_student_enrolled_in_offering\(id\)/);
assert.match(sql, /create or replace function public\.get_student_course_facilitators\(target_offering_ids uuid\[\]\)/);
assert.match(sql, /returns table \(\s*cohort_course_id uuid,\s*assignment_role text,\s*display_name text,\s*title text\s*\)/s);
assert.match(sql, /current_student_enrolled_in_offering\(assignments\.cohort_course_id\)/);
assert.match(sql, /add column if not exists requirement_snapshot jsonb/);
assert.doesNotMatch(sql, /update\s+public\.recording_learning_assignments\s+set\s+requirement_snapshot/i, "Historical requirement evidence must not be invented.");
assert.doesNotMatch(sql, /for\s+(insert|update|delete)|with\s+check\s*\(\s*true\s*\)/i, "The readiness patch must not grant client-controlled academic writes.");

const currentApplication = await read("lib/lms/studentLearning.ts");
assert.match(currentApplication, /rpc\("get_student_course_facilitators", \{ target_offering_ids: offeringIds \}\)/);
const recordingService = await read("lib/lms/recordingService.ts");
assert.match(recordingService, /requirement_snapshot: input\.requirements/);
assert.match(recordingService, /legacyRequirementSnapshot: true/);
assert.doesNotMatch(recordingService, /\{ \.\.\.current, \.\.\.snapshot \}/, "Legacy assignments must not inherit today's requirements.");

const original = { minWatchPercentage: 85, deadlineHours: 72, requiredCheckpointCount: 2, requiresCheckpoints: true, requiresQuiz: false, requiresPractical: false, requiresReflection: true, requiresOralVerification: false, allowLateCompletion: true };
assert.deepEqual(resolveRecordingRequirementSnapshot(original), { status: "snapshot", requirements: original });
assert.deepEqual(resolveRecordingRequirementSnapshot(null), { status: "legacy", requirements: null });
assert.deepEqual(resolveRecordingRequirementSnapshot({}), { status: "legacy", requirements: null });

const result = {
  staticPolicyChecks: 6,
  facilitatorRpcContract: "current",
  snapshotContract: "jsonb",
  snapshotPreservationCases: 3,
};

if (process.env.BUILD_13_LIVE === "1") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey) throw new Error("Supabase environment variables are required for the live readiness audit.");

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const fixtureResult = await admin.from("students").select("id, profile_id, email").not("profile_id", "is", null).not("email", "is", null).limit(20);
  if (fixtureResult.error) throw new Error(`Linked student lookup failed: ${fixtureResult.error.message}`);
  let fixture = null;
  let fixtureOfferingIds = [];
  for (const student of fixtureResult.data ?? []) {
    const facilitator = await admin.from("facilitators").select("id").eq("profile_id", student.profile_id).maybeSingle();
    if (facilitator.data) continue;
    const enrollments = await admin.from("student_enrollments").select("id").eq("student_id", student.id);
    if (enrollments.error || !enrollments.data?.length) continue;
    const candidates = await admin.from("course_enrollments").select("cohort_course_id").in("student_enrollment_id", enrollments.data.map((row) => row.id)).in("enrollment_status", ["active", "enrolled"]);
    if (candidates.error || !candidates.data?.length) continue;
    const candidateOfferingIds = candidates.data.map((row) => row.cohort_course_id);
    const presentations = await admin.from("facilitator_course_assignments").select("id, facilitators!inner(active)").in("cohort_course_id", candidateOfferingIds).eq("facilitators.active", true).limit(1);
    if (!presentations.error && presentations.data?.length) { fixture = student; fixtureOfferingIds = candidateOfferingIds; break; }
  }
  if (!fixture?.profile_id || !fixture.email) throw new Error("A linked student with assigned facilitators and course enrolments is required for the live readiness audit.");

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: fixture.email });
  if (link.error || !link.data.properties?.hashed_token) throw new Error(`Student test sign-in could not be generated: ${link.error?.message ?? "missing token"}`);
  const authClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const verified = await authClient.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "email" });
  if (verified.error || !verified.data.session) throw new Error(`Student test sign-in failed: ${verified.error?.message ?? "missing session"}`);

  const ownEnrollmentResult = await authClient.from("student_enrollments").select("id").eq("student_id", fixture.id);
  assert.equal(ownEnrollmentResult.error, null);
  const ownEnrollmentIds = new Set((ownEnrollmentResult.data ?? []).map((row) => row.id));
  const courseEnrollmentResult = await authClient.from("course_enrollments").select("id, student_enrollment_id, cohort_course_id, enrollment_status").in("enrollment_status", ["active", "enrolled"]);
  assert.equal(courseEnrollmentResult.error, null);
  assert.ok((courseEnrollmentResult.data ?? []).every((row) => ownEnrollmentIds.has(row.student_enrollment_id)), "A student must not read another student's course enrolment.");
  const offeringIds = new Set((courseEnrollmentResult.data ?? []).map((row) => row.cohort_course_id));
  assert.ok(fixtureOfferingIds.some((id) => offeringIds.has(id)));

  const offeringMapResult = await admin.from("cohort_courses").select("id, course_id");
  if (offeringMapResult.error) throw new Error(`Offering map failed: ${offeringMapResult.error.message}`);
  const enrolledCourseIds = new Set((offeringMapResult.data ?? []).filter((row) => offeringIds.has(row.id)).map((row) => row.course_id));
  const outOfScopeOffering = (offeringMapResult.data ?? []).find((row) => !offeringIds.has(row.id));
  const authorizedSessionsResult = await admin.from("class_sessions").select("id, cohort_course_id").in("cohort_course_id", [...offeringIds]);
  if (authorizedSessionsResult.error) throw new Error(`Authorized session map failed: ${authorizedSessionsResult.error.message}`);
  const authorizedSessionIds = new Set((authorizedSessionsResult.data ?? []).map((row) => row.id));
  const [courses, offerings, sessions] = await Promise.all([
    authClient.from("courses").select("id, code"),
    authClient.from("cohort_courses").select("id, course_id"),
    authClient.from("class_sessions").select("id, cohort_course_id"),
  ]);
  for (const query of [courses, offerings, sessions]) assert.equal(query.error, null);
  const [summaries, resources, recordings, rawAssignments, rawFacilitators, presentation] = await Promise.all([
    authClient.from("class_summaries").select("id, class_session_id"),
    authClient.from("session_resources").select("id, class_session_id"),
    authClient.from("class_recordings").select("id, class_session_id"),
    authClient.from("facilitator_course_assignments").select("id, cohort_course_id, facilitator_id"),
    authClient.from("facilitators").select("id, profile_id, display_name, title"),
    authClient.rpc("get_student_course_facilitators", { target_offering_ids: [...offeringIds] }),
  ]);
  for (const query of [summaries, resources, recordings, rawAssignments, rawFacilitators]) assert.equal(query.error, null);

  const leaks = {
    courses: (courses.data ?? []).filter((row) => !enrolledCourseIds.has(row.id)).length,
    cohortCourses: (offerings.data ?? []).filter((row) => !offeringIds.has(row.id)).length,
    classSessions: (sessions.data ?? []).filter((row) => !offeringIds.has(row.cohort_course_id)).length,
    classSummaries: (summaries.data ?? []).filter((row) => !authorizedSessionIds.has(row.class_session_id)).length,
    sessionResources: (resources.data ?? []).filter((row) => !authorizedSessionIds.has(row.class_session_id)).length,
    classRecordings: (recordings.data ?? []).filter((row) => !authorizedSessionIds.has(row.class_session_id)).length,
    facilitatorAssignmentsOutsideCourses: (rawAssignments.data ?? []).filter((row) => !offeringIds.has(row.cohort_course_id)).length,
    rawFacilitatorRows: rawFacilitators.data?.length ?? 0,
  };

  if (!presentation.error) {
    const allowedKeys = ["assignment_role", "cohort_course_id", "display_name", "title"];
    assert.ok((presentation.data ?? []).every((row) => offeringIds.has(row.cohort_course_id)));
    assert.ok((presentation.data ?? []).every((row) => Object.keys(row).sort().join(",") === allowedKeys.sort().join(",")), "The RPC must return presentation fields only.");
  }

  const [courseHelper, offeringHelper] = outOfScopeOffering ? await Promise.all([
    authClient.rpc("current_student_enrolled_in_course", { target_course_id: outOfScopeOffering.course_id }),
    authClient.rpc("current_student_enrolled_in_offering", { target_offering_id: outOfScopeOffering.id }),
  ]) : [{ data: null, error: null }, { data: null, error: null }];
  const unrelatedPresentation = outOfScopeOffering
    ? await authClient.rpc("get_student_course_facilitators", { target_offering_ids: [outOfScopeOffering.id] })
    : { data: [], error: null };
  const assignmentCount = await admin.from("recording_learning_assignments").select("id", { count: "exact", head: true });
  assert.equal(assignmentCount.error, null);
  const snapshotColumn = await admin.from("recording_learning_assignments").select("requirement_snapshot").limit(1);

  if (process.env.BUILD_13_EXPECT_PATCHED === "1") {
    assert.deepEqual(leaks, { courses: 0, cohortCourses: 0, classSessions: 0, classSummaries: 0, sessionResources: 0, classRecordings: 0, facilitatorAssignmentsOutsideCourses: 0, rawFacilitatorRows: 0 });
    assert.ok([...enrolledCourseIds].every((id) => (courses.data ?? []).some((row) => row.id === id)), "Course A must remain available.");
    assert.ok([...offeringIds].every((id) => (offerings.data ?? []).some((row) => row.id === id)), "Course A's offering must remain available.");
    assert.equal(courseHelper.error, null);
    assert.equal(offeringHelper.error, null);
    assert.equal(presentation.error, null, "The Build 5 facilitator presentation RPC must be installed.");
    assert.ok(presentation.data?.length, "The student must see the approved facilitator presentation for an assigned course.");
    assert.equal(unrelatedPresentation.error, null);
    assert.equal(unrelatedPresentation.data?.length, 0, "An unrelated course's facilitator presentation must not be exposed.");
    assert.equal(snapshotColumn.error, null, "The Build 7 requirement_snapshot column must be installed.");
  }

  Object.assign(result, {
    live: true,
    approvedCourseEnrollments: courseEnrollmentResult.data?.length ?? 0,
    foreignCourseEnrollmentsVisible: (courseEnrollmentResult.data ?? []).filter((row) => !ownEnrollmentIds.has(row.student_enrollment_id)).length,
    leaks,
    facilitatorPresentationRpcAvailable: presentation.error === null,
    facilitatorPresentationRpcErrorCode: presentation.error?.code ?? null,
    facilitatorPresentationRows: presentation.data?.length ?? 0,
    build4EnrollmentHelpersAvailable: courseHelper.error === null && offeringHelper.error === null,
    build4EnrollmentHelperErrorCodes: [courseHelper.error?.code, offeringHelper.error?.code].filter(Boolean),
    requirementSnapshotColumnAvailable: snapshotColumn.error === null,
    requirementSnapshotColumnErrorCode: snapshotColumn.error?.code ?? null,
    existingRecordedLearningAssignments: assignmentCount.count ?? 0,
  });
}

console.log(JSON.stringify(result, null, 2));
