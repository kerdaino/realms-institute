import assert from "node:assert/strict";

import { createClient } from "@supabase/supabase-js";
import { confirmPortalSession } from "./live-portal-session.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.BUILD_5_BASE_URL || "http://localhost:3000";
if (!url || !publicKey || !serviceKey) throw new Error("Supabase environment variables are required.");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const studentResult = await admin.from("students").select("id, profile_id, student_number, email").not("profile_id", "is", null).limit(1).maybeSingle();
if (studentResult.error) throw new Error(`Linked student lookup failed: ${studentResult.error.message}`);
if (!studentResult.data?.profile_id) throw new Error("A linked student fixture is required for the Build 5 test.");
const fixture = studentResult.data;

async function tokenHash() {
  const result = await admin.auth.admin.generateLink({ type: "magiclink", email: fixture.email, options: { redirectTo: `${baseUrl}/auth/callback` } });
  if (result.error || !result.data.properties?.hashed_token) throw new Error(`Student test sign-in could not be generated: ${result.error?.message ?? "missing token"}`);
  return result.data.properties.hashed_token;
}

const authClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
const verified = await authClient.auth.verifyOtp({ token_hash: await tokenHash(), type: "email" });
if (verified.error || !verified.data.session) throw new Error(`Student test sign-in failed: ${verified.error?.message ?? "missing session"}`);

const enrollmentResult = await authClient.from("student_enrollments").select("id, discipleship_route, skill_pathway").eq("student_id", fixture.id).order("enrolled_at", { ascending: false }).limit(1).maybeSingle();
assert.equal(enrollmentResult.error, null);
assert.ok(enrollmentResult.data);
const courseResult = await authClient.from("course_enrollments").select("id, cohort_course_id, enrollment_status, cohort_courses(courses(code, title, course_category, discipleship_route, skill_pathway, sequence_number))").eq("student_enrollment_id", enrollmentResult.data.id).in("enrollment_status", ["active", "enrolled"]);
assert.equal(courseResult.error, null);

const courses = courseResult.data.flatMap((row) => {
  const offering = Array.isArray(row.cohort_courses) ? row.cohort_courses[0] : row.cohort_courses;
  const course = Array.isArray(offering?.courses) ? offering.courses[0] : offering?.courses;
  return course ? [{ courseEnrollmentId: row.id, offeringId: row.cohort_course_id, ...course }] : [];
}).sort((a, b) => (a.sequence_number ?? 999) - (b.sequence_number ?? 999));
const routePrefix = enrollmentResult.data.discipleship_route === "advanced" ? "RSD-ADV" : "RSD-DIS";
const skillPrefix = enrollmentResult.data.skill_pathway === "cybersecurity_foundations" ? "RSD-CYB" : "RSD-WEB";
const routeCourses = courses.filter((course) => course.code.startsWith(routePrefix));
const skillCourses = courses.filter((course) => course.code.startsWith(skillPrefix));
assert.equal(routeCourses.length, enrollmentResult.data.discipleship_route === "advanced" ? 5 : 8);
assert.equal(skillCourses.length, 9);
assert.equal(courses.some((course) => course.code.startsWith(routePrefix === "RSD-DIS" ? "RSD-ADV" : "RSD-DIS")), false);
assert.equal(courses.some((course) => course.code.startsWith(skillPrefix === "RSD-WEB" ? "RSD-CYB" : "RSD-WEB")), false);

const sessionsResult = await authClient.from("class_sessions").select("id, cohort_course_id, title, session_number, scheduled_start_at, session_status");
assert.equal(sessionsResult.error, null);
assert.ok(sessionsResult.data.every((session) => courses.some((course) => course.offeringId === session.cohort_course_id)));
const fixtureSession = sessionsResult.data[0];
assert.ok(fixtureSession);
const fixtureCourse = courses.find((course) => course.offeringId === fixtureSession.cohort_course_id);
assert.ok(fixtureCourse);

const [summaryResult, resourceResult, recordingResult, facilitatorResult, catalogueResult] = await Promise.all([
  authClient.from("class_summaries").select("id, class_session_id, title, summary_status, version_number, learning_objectives, key_teaching_points, practical_applications"),
  authClient.from("session_resources").select("id, class_session_id, title, access_level, is_active"),
  authClient.from("class_recordings").select("id, class_session_id, recording_status, access_level"),
  authClient.rpc("get_student_course_facilitators", { target_offering_ids: [fixtureCourse.offeringId] }),
  authClient.from("courses").select("code"),
]);
for (const result of [summaryResult, resourceResult, recordingResult, catalogueResult]) assert.equal(result.error, null);
assert.ok(summaryResult.data.every((summary) => summary.summary_status === "published"));
assert.ok(resourceResult.data.every((resource) => resource.access_level === "enrolled_students" && resource.is_active));
assert.ok(recordingResult.data.every((recording) => recording.recording_status === "available" && recording.access_level === "enrolled_students"));
const unenrolledCatalogueCodes = catalogueResult.data.map((course) => course.code).filter((code) => !courses.some((course) => course.code === code));
if (process.env.BUILD_5_REQUIRE_MIGRATIONS === "1") {
  assert.equal(unenrolledCatalogueCodes.length, 0, "Build 4 course catalogue RLS migration is not active");
  assert.equal(facilitatorResult.error, null, "Build 5 facilitator presentation migration is not active");
  assert.ok(facilitatorResult.data.length > 0, "No assigned facilitator presentation was returned");
}

const confirmation = await confirmPortalSession(baseUrl, await tokenHash());
assert.ok([303, 307].includes(confirmation.status));
const cookie = confirmation.cookie;
async function load(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { cookie }, redirect: "manual" });
  return { response, html: await response.text() };
}

const coursePage = await load(`/student/courses/${fixtureCourse.courseEnrollmentId}`);
assert.equal(coursePage.response.status, 200);
assert.ok(coursePage.html.includes(fixtureCourse.code));
assert.ok(coursePage.html.includes(fixtureSession.title));
assert.ok(coursePage.html.includes("Class Summary Archive"));
const sessionPage = await load(`/student/sessions/${fixtureSession.id}`);
assert.equal(sessionPage.response.status, 200);
assert.ok(sessionPage.html.includes(fixtureSession.title));
assert.ok(sessionPage.html.includes("Class Summary"));
if (summaryResult.data.some((summary) => summary.class_session_id === fixtureSession.id)) {
  assert.ok(sessionPage.html.includes("Published Class Summary"));
  assert.ok(sessionPage.html.includes("Last Updated"));
  const summary = summaryResult.data.find((item) => item.class_session_id === fixtureSession.id);
  if (!summary.practical_applications?.length) assert.equal(sessionPage.html.includes("Practical Applications"), false);
}
for (const resource of resourceResult.data.filter((item) => item.class_session_id === fixtureSession.id)) assert.ok(sessionPage.html.includes(resource.title));

const deniedCourse = await load("/student/courses/00000000-0000-4000-8000-000000000001");
const deniedSession = await load("/student/sessions/00000000-0000-4000-8000-000000000002");
assert.ok(deniedCourse.response.status === 404 || deniedCourse.response.status === 200);
assert.ok(deniedCourse.html.includes("This course is not available in your student account."));
assert.ok(deniedSession.response.status === 404 || deniedSession.response.status === 200);
assert.ok(deniedSession.html.includes("This class session is not available in your student account."));
const dashboardPage = await load("/student");
assert.equal(dashboardPage.response.status, 200);
if (summaryResult.data.some((summary) => summary.class_session_id === fixtureSession.id)) {
  assert.ok(dashboardPage.html.includes(`/student/sessions/${fixtureSession.id}#summary`));
}

const processingRecording = await admin.from("class_recordings").select("id").eq("recording_status", "processing").limit(1).maybeSingle();
let processingRecordingAccess = "no_fixture";
if (processingRecording.data) {
  const response = await fetch(`${baseUrl}/api/student/recordings/${processingRecording.data.id}`, { headers: { cookie }, redirect: "manual" });
  processingRecordingAccess = String(response.status);
  assert.equal(response.status, 403);
}

console.log(JSON.stringify({
  route: enrollmentResult.data.discipleship_route,
  routeCourseCount: routeCourses.length,
  skillPathway: enrollmentResult.data.skill_pathway,
  skillCourseCount: skillCourses.length,
  visibleSessionCount: sessionsResult.data.length,
  publishedSummaryCount: summaryResult.data.length,
  permittedResourceCount: resourceResult.data.length,
  availableRecordingCount: recordingResult.data.length,
  assignedFacilitatorRowsVisible: facilitatorResult.data?.length ?? 0,
  facilitatorPresentationMigrationActive: facilitatorResult.error === null,
  unenrolledCatalogueRowsVisible: unenrolledCatalogueCodes.length,
  courseDetailStatus: coursePage.response.status,
  sessionDetailStatus: sessionPage.response.status,
  deniedCourseStatus: deniedCourse.response.status,
  deniedSessionStatus: deniedSession.response.status,
  processingRecordingAccess,
}, null, 2));
