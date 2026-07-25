import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { learningResourceFileAccept, privateFileContentMatches, privateFileLimits, privateFileSignedUrlSeconds, privateStorageBuckets } from "../lib/lms/privateFilePolicy.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  service,
  facilitatorCollection,
  facilitatorItem,
  facilitatorDownload,
  studentDownload,
  adminCollection,
  adminDownload,
  facilitatorAccess,
  facilitatorUi,
  sharedForm,
  studentResources,
  studentCourse,
  studentSessionUi,
  studentDashboard,
  studentLearning,
  sql,
  oldPrivateSql,
] = await Promise.all([
  read("lib/lms/learningResourceStorage.server.ts"),
  read("app/api/facilitator/sessions/[id]/resources/route.ts"),
  read("app/api/facilitator/sessions/[id]/resources/[resourceId]/route.ts"),
  read("app/api/facilitator/sessions/[id]/resources/[resourceId]/download/route.ts"),
  read("app/api/student/session-resources/[resourceId]/download/route.ts"),
  read("app/api/admin/sessions/[id]/resources/route.ts"),
  read("app/api/admin/sessions/[id]/resources/[resourceId]/download/route.ts"),
  read("lib/lms/facilitatorSessions.ts"),
  read("components/portal/FacilitatorResourceManager.tsx"),
  read("components/portal/LearningResourceForm.tsx"),
  read("app/student/(academic)/resources/page.tsx"),
  read("app/student/(academic)/courses/[courseEnrollmentId]/page.tsx"),
  read("components/student/StudentLearningUi.tsx"),
  read("lib/lms/studentDashboard.ts"),
  read("lib/lms/studentLearning.ts"),
  read("supabase/lms_learning_resources_private_storage.sql"),
  read("supabase/lms_next_4_private_storage.sql"),
]);

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
}

check("dedicated private learning bucket", () => assert.equal(privateStorageBuckets.learningResource, "learning-resources"));
check("safe Vercel upload size", () => assert.equal(privateFileLimits.learningResource, 4 * 1024 * 1024));
check("five-minute signed downloads", () => assert.equal(privateFileSignedUrlSeconds, 300));
check("all requested material extensions are advertised", () => {
  for (const extension of [".pdf", ".docx", ".pptx", ".xlsx", ".txt", ".jpg", ".jpeg", ".png", ".webp"]) assert.match(learningResourceFileAccept, new RegExp(extension.replace(".", "\\.")));
});
check("PowerPoint OOXML signature is inspected", () => {
  const bytes = new TextEncoder().encode("PK\u0003\u0004[Content_Types].xml ppt/");
  assert.equal(privateFileContentMatches("pptx", bytes), true);
});
check("spreadsheet OOXML signature is inspected", () => {
  const bytes = new TextEncoder().encode("PK\u0003\u0004[Content_Types].xml xl/");
  assert.equal(privateFileContentMatches("xlsx", bytes), true);
});
check("renamed executable is not accepted as PDF", () => assert.equal(privateFileContentMatches("pdf", new TextEncoder().encode("MZ executable")), false));
check("facilitator create route authorises exact session before service-role mutation", () => {
  assert.ok(facilitatorCollection.indexOf("requireFacilitatorSessionAccess(context, id)") < facilitatorCollection.indexOf("requireLmsAdminClient()"));
});
check("facilitator resource deactivation reauthorises and scopes resource to session", () => {
  assert.match(facilitatorItem, /requireFacilitatorSessionAccess\(context, id\)/);
  assert.match(facilitatorItem, /\.eq\("class_session_id", id\)/);
  assert.match(facilitatorItem, /is_active: false/);
});
check("facilitator download reauthorises the resource session", () => {
  assert.match(facilitatorDownload, /requireFacilitatorSessionAccess\(context, resource\.class_session_id\)/);
});
check("authoritative assignment accepts direct session or offering assignment only", () => {
  assert.match(facilitatorAccess, /session\.data\.facilitator_id === context\.facilitatorId/);
  assert.match(facilitatorAccess, /facilitator_course_assignments/);
});
check("external links reuse secure URL validation and session resource service", () => {
  assert.match(service, /readHttpUrl/);
  assert.match(service, /addSessionResource/);
});
check("uploads validate type, size, content and do not overwrite", () => {
  assert.match(service, /validatePrivateUpload\(input\.file, "learning_resource", privateFileLimits\.learningResource\)/);
  assert.match(service, /upsert: false/);
});
check("storage paths include cohort offering session and unique resource", () => {
  assert.match(service, /cohort\/\$\{cohortId\}\/offering\/\$\{session\.data\.cohort_course_id\}\/session\/\$\{input\.sessionId\}\/\$\{resourceId\}/);
});
check("failed metadata persistence cleans the newly uploaded object", () => assert.match(service, /\.remove\(\[objectPath\]\)/));
check("student download requires active visible resource and owned enrolment", () => {
  assert.match(service, /studentVisibleOnly.*eq\("is_active", true\)\.eq\("access_level", "enrolled_students"\)/s);
  assert.match(service, /\.eq\("profile_id", profileId\)/);
  assert.match(service, /\.in\("student_enrollment_id", enrollmentIds\)/);
  assert.match(service, /\.eq\("cohort_course_id", offeringId\)/);
});
check("student route authenticates the student before signing", () => {
  assert.match(studentDownload, /getCurrentUser/);
  assert.match(studentDownload, /getCurrentUserRoles/);
  assert.match(studentDownload, /createStudentLearningResourceDownload/);
});
check("signed URLs are produced only in server code", () => {
  assert.match(service, /createSignedUrl\(storagePath, privateFileSignedUrlSeconds/);
  assert.doesNotMatch(facilitatorUi + sharedForm + studentResources + studentCourse + studentSessionUi, /createSignedUrl|SUPABASE_SERVICE_ROLE_KEY|storage_path/);
});
check("facilitator UI supports add open and soft deactivate", () => {
  assert.match(facilitatorUi, /LearningResourceForm/);
  assert.match(facilitatorUi, /Open Material/);
  assert.match(facilitatorUi, /Deactivate/);
});
check("student resources, course and session views open private material through the authorised endpoint", () => {
  for (const source of [studentResources, studentCourse, studentSessionUi]) {
    assert.match(source, /api\/student\/session-resources\/\$\{resource\.id\}\/download/);
    assert.match(source, /Open Material/);
  }
});
check("student resource loaders expose only a file capability flag, not the path", () => {
  assert.match(studentDashboard, /hasControlledFile: Boolean\(text\(row\.storage_path\)\)/);
  assert.match(studentLearning, /hasControlledFile: Boolean\(text\(row\.storage_path\)\)/);
});
check("admin URL workflow and uploaded-material access remain available", () => {
  assert.match(adminCollection, /addExternalLearningResource/);
  assert.match(adminCollection, /storeLearningResourceUpload/);
  assert.match(adminDownload, /isAdminAuthenticated/);
});
check("migration keeps learning resources private and size limited", () => {
  assert.match(sql, /'learning-resources'[\s\S]{0,120}false/);
  assert.match(sql, /4194304/);
  assert.match(sql, /allowed_mime_types/);
  assert.match(sql, /as restrictive/);
});
check("resource RLS is restrictive across enrolment and facilitator assignment", () => {
  assert.match(sql, /realms_session_resources_authorized_boundary/);
  assert.match(sql, /current_student_enrolled_in_offering/);
  assert.match(sql, /current_facilitator_assigned_to_offering/);
  assert.match(sql, /session_resources\.is_active = true/);
  assert.match(sql, /session_resources\.access_level = 'enrolled_students'/);
  assert.doesNotMatch(sql, /for (insert|update|delete)/i);
});
check("existing private content buckets remain protected", () => {
  for (const bucket of ["assessment-submissions", "absence-evidence", "institutional-awards"]) {
    assert.match(oldPrivateSql + sql, new RegExp(`'${bucket}'`));
  }
});
check("resource audit events cover creation upload and deactivation", () => {
  assert.match(service, /session_resource_added/);
  assert.match(service, /session_resource_file_uploaded/);
  assert.match(facilitatorItem, /updateSessionResource/);
});

assert.equal(passed, 26);
console.log(`Learning-resource checks passed (${passed}).`);
