import assert from "node:assert/strict";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.BUILD_4_BASE_URL || "http://localhost:3000";
if (!url || !publicKey || !serviceKey) throw new Error("Supabase environment variables are required.");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const studentResult = await admin.from("students").select("id, profile_id, student_number, email").not("profile_id", "is", null).limit(1).maybeSingle();
if (studentResult.error) throw new Error(`Linked student lookup failed: ${studentResult.error.message}`);
if (!studentResult.data?.profile_id) throw new Error("A linked student fixture is required for the Build 4 test.");
const fixture = studentResult.data;

async function createTokenHash() {
  const result = await admin.auth.admin.generateLink({ type: "magiclink", email: fixture.email, options: { redirectTo: `${baseUrl}/auth/callback` } });
  if (result.error || !result.data.properties?.hashed_token) throw new Error(`Student test sign-in could not be generated: ${result.error?.message ?? "missing token"}`);
  return result.data.properties.hashed_token;
}

const authClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
const verified = await authClient.auth.verifyOtp({ token_hash: await createTokenHash(), type: "email" });
if (verified.error || !verified.data.session) throw new Error(`Student test sign-in failed: ${verified.error?.message ?? "missing session"}`);

const [roleResult, ownStudentResult] = await Promise.all([
  authClient.from("user_roles").select("roles(name)").eq("user_id", fixture.profile_id),
  authClient.from("students").select("id, profile_id, student_number, student_status, onboarding_status").eq("profile_id", fixture.profile_id),
]);
assert.equal(roleResult.error, null);
assert.equal(ownStudentResult.error, null);
assert.equal(ownStudentResult.data.length, 1);
assert.ok(roleResult.data.some((row) => row.roles?.name === "student" || row.roles?.[0]?.name === "student"));

const enrollmentResult = await authClient.from("student_enrollments").select("id, cohort_id, discipleship_route, skill_pathway, skill_learning_mode, enrolment_status").eq("student_id", ownStudentResult.data[0].id).maybeSingle();
assert.equal(enrollmentResult.error, null);
assert.ok(enrollmentResult.data);
const courseEnrollmentResult = await authClient.from("course_enrollments").select("id, cohort_course_id, enrollment_status, cohort_courses(courses(code, course_category, discipleship_route, skill_pathway))").eq("student_enrollment_id", enrollmentResult.data.id).in("enrollment_status", ["active", "enrolled"]);
assert.equal(courseEnrollmentResult.error, null);
assert.ok(courseEnrollmentResult.data.length > 0);

const codes = courseEnrollmentResult.data.flatMap((row) => {
  const offering = Array.isArray(row.cohort_courses) ? row.cohort_courses[0] : row.cohort_courses;
  const course = Array.isArray(offering?.courses) ? offering.courses[0] : offering?.courses;
  return course?.code ? [course.code] : [];
});
const routePrefix = enrollmentResult.data.discipleship_route === "advanced" ? "RSD-ADV" : "RSD-DIS";
const excludedRoutePrefix = enrollmentResult.data.discipleship_route === "advanced" ? "RSD-DIS" : "RSD-ADV";
const skillPrefix = enrollmentResult.data.skill_pathway === "web_development" ? "RSD-WEB" : "RSD-CYB";
const excludedSkillPrefix = enrollmentResult.data.skill_pathway === "web_development" ? "RSD-CYB" : "RSD-WEB";
assert.ok(codes.some((code) => code.startsWith(routePrefix)));
assert.ok(codes.some((code) => code.startsWith(skillPrefix)));
assert.equal(codes.some((code) => code.startsWith(excludedRoutePrefix)), false);
assert.equal(codes.some((code) => code.startsWith(excludedSkillPrefix)), false);
const catalogueResult = await authClient.from("courses").select("code");
assert.equal(catalogueResult.error, null);
const unenrolledCatalogueCodes = catalogueResult.data.map((course) => course.code).filter((code) => !codes.includes(code));
if (process.env.BUILD_4_REQUIRE_MIGRATION === "1") assert.equal(unenrolledCatalogueCodes.length, 0, "Build 4 course catalogue RLS migration is not active");

const offeringIds = courseEnrollmentResult.data.map((row) => row.cohort_course_id);
const sessionsResult = await authClient.from("class_sessions").select("id, cohort_course_id, scheduled_start_at, session_status, visibility_status");
assert.equal(sessionsResult.error, null);
assert.ok(sessionsResult.data.every((session) => offeringIds.includes(session.cohort_course_id)));
const sessionIds = sessionsResult.data.map((session) => session.id);
const [summaryResult, recordingResult, resourceResult] = await Promise.all([
  authClient.from("class_summaries").select("id, class_session_id, summary_status"),
  authClient.from("class_recordings").select("id, class_session_id, recording_status, access_level"),
  authClient.from("session_resources").select("id, class_session_id, is_active, access_level"),
]);
for (const result of [summaryResult, recordingResult, resourceResult]) assert.equal(result.error, null);
assert.ok(summaryResult.data.every((item) => item.summary_status === "published" && sessionIds.includes(item.class_session_id)));
assert.ok(recordingResult.data.every((item) => item.recording_status === "available" && item.access_level === "enrolled_students" && sessionIds.includes(item.class_session_id)));
assert.ok(resourceResult.data.every((item) => item.is_active && item.access_level === "enrolled_students" && sessionIds.includes(item.class_session_id)));

const otherStudentResult = await authClient.from("students").select("id").eq("id", "00000000-0000-4000-8000-000000000001");
assert.equal(otherStudentResult.error, null);
assert.equal(otherStudentResult.data.length, 0);

const confirmResponse = await fetch(`${baseUrl}/auth/confirm?token_hash=${encodeURIComponent(await createTokenHash())}&type=magiclink`, { redirect: "manual" });
assert.equal(confirmResponse.status, 307);
const setCookies = confirmResponse.headers.getSetCookie();
assert.ok(setCookies.length > 0);
const cookie = setCookies.map((value) => value.split(";", 1)[0]).join("; ");
const pageResults = {};
for (const path of ["/student", "/student/courses", "/student/calendar", "/student/resources", "/student/profile"]) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { cookie }, redirect: "manual" });
  const html = await response.text();
  assert.equal(response.status, 200, `${path} should render for the authenticated student`);
  assert.ok(html.includes("REALMS"));
  pageResults[path] = response.status;
  if (path === "/student") {
    assert.ok(html.includes(fixture.student_number));
    assert.ok(html.includes(routePrefix === "RSD-DIS" ? "Foundational Discipleship Programme" : "Advanced Discipleship Programme"));
    assert.ok(html.includes(skillPrefix === "RSD-WEB" ? "Web Development" : "Cybersecurity Foundations"));
  }
}

console.log(JSON.stringify({
  authenticatedStudent: true,
  ownStudentRows: ownStudentResult.data.length,
  route: enrollmentResult.data.discipleship_route,
  skillPathway: enrollmentResult.data.skill_pathway,
  enrolledCourseCount: codes.length,
  visibleSessionCount: sessionsResult.data.length,
  publishedSummaryCount: summaryResult.data.length,
  availableRecordingCount: recordingResult.data.length,
  permittedResourceCount: resourceResult.data.length,
  otherStudentRowsVisible: otherStudentResult.data.length,
  unenrolledCatalogueRowsVisible: unenrolledCatalogueCodes.length,
  pages: pageResults,
}, null, 2));
