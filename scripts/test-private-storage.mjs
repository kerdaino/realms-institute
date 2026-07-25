import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { assessmentUploadLimit, fileExtension, isDangerousFileExtension, privateFileContentMatches, privateFileLimits, privateFileSignedUrlSeconds, privateStorageBuckets, safeDisplayFilename } from "../lib/lms/privateFilePolicy.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [server, sql, learningSql, assessmentService, assessmentRoute, absenceRoute, studentDownload, facilitatorDownload, adminDownload, studentAbsenceDownload, adminAbsenceDownload, studentAwardDownload, awardService, publicAward, assessmentUi, absenceUi, uploadUi, orphanAudit] = await Promise.all([
  read("lib/lms/privateStorage.server.ts"), read("supabase/lms_next_4_private_storage.sql"), read("supabase/lms_learning_resources_private_storage.sql"), read("lib/lms/assessmentService.ts"), read("app/api/student/assignments/[id]/submit/route.ts"), read("app/api/student/absences/[id]/evidence/route.ts"), read("app/api/student/assignment-artifacts/[artifactId]/download/route.ts"), read("app/api/facilitator/assignment-artifacts/[artifactId]/download/route.ts"), read("app/api/admin/assignment-artifacts/[artifactId]/download/route.ts"), read("app/api/student/absence-evidence/[evidenceId]/download/route.ts"), read("app/api/admin/absence-evidence/[evidenceId]/download/route.ts"), read("app/api/student/awards/[awardId]/download/route.ts"), read("lib/lms/awardService.ts"), read("app/api/certificates/verify/route.ts"), read("components/student/StudentAssessmentUi.tsx"), read("components/student/AbsenceRequestForms.tsx"), read("components/student/privateUpload.ts"), read("scripts/audit-private-storage-orphans.mjs"),
]);

let passed = 0;
function check(name, fn) { fn(); passed += 1; }

check("four named private areas", () => assert.deepEqual(Object.values(privateStorageBuckets), ["assessment-submissions", "absence-evidence", "institutional-awards", "learning-resources"]));
check("standard assessment limit", () => assert.equal(privateFileLimits.assessmentAttachment, 15 * 1024 * 1024));
check("capstone archive limit", () => assert.equal(assessmentUploadLimit("capstone", "capstone"), 50 * 1024 * 1024));
check("absence limit", () => assert.equal(privateFileLimits.absenceEvidence, 10 * 1024 * 1024));
check("certificate limit", () => assert.equal(privateFileLimits.certificatePdf, 10 * 1024 * 1024));
check("learning-resource limit leaves Vercel multipart headroom", () => assert.equal(privateFileLimits.learningResource, 4 * 1024 * 1024));
check("five-minute signed URLs", () => assert.equal(privateFileSignedUrlSeconds, 300));
check("traversal is removed from display names", () => assert.equal(safeDisplayFilename("../../private/report.pdf"), "report.pdf"));
check("control characters and absolute paths are removed", () => assert.equal(safeDisplayFilename("/tmp/a\u0000b.pdf"), "ab.pdf"));
check("dangerous executables are rejected", () => assert.equal(isDangerousFileExtension("project.exe"), true));
check("extension normalization works", () => assert.equal(fileExtension("REPORT.PDF"), "pdf"));
check("PDF signature is checked", () => assert.equal(privateFileContentMatches("pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])), true));
check("renamed fake PDF is rejected", () => assert.equal(privateFileContentMatches("pdf", new TextEncoder().encode("not a pdf")), false));
check("ZIP/DOCX container signature is checked", () => assert.equal(privateFileContentMatches("zip", new Uint8Array([0x50, 0x4b, 0x03, 0x04])), true));
check("renamed ZIP is not accepted as DOCX", () => assert.equal(privateFileContentMatches("docx", new Uint8Array([0x50, 0x4b, 0x03, 0x04])), false));
check("SQL creates all buckets private", () => { const combinedSql = `${sql}\n${learningSql}`; for (const bucket of Object.values(privateStorageBuckets)) assert.match(combinedSql, new RegExp(`'${bucket}'[\\s\\S]{0,120}false`)); });
check("SQL limits bucket MIME and size", () => { assert.match(sql, /52428800/); assert.match(sql, /10485760/); assert.match(sql, /allowed_mime_types/); });
check("SQL blocks direct access with a restrictive storage policy", () => { assert.match(learningSql, /create policy realms_private_workflow_objects_server_only/); assert.match(learningSql, /as restrictive/); assert.match(learningSql, /bucket_id not in/); assert.match(learningSql, /'learning-resources'/); assert.doesNotMatch(learningSql, /using \(bucket_id in/); });
check("metadata reuses domain tables", () => { assert.match(sql, /alter table public\.assignment_submission_artifacts/); assert.match(sql, /alter table public\.absence_request_evidence/); assert.match(sql, /alter table public\.institutional_awards/); });
check("student assessment ownership is resolved server-side", () => { assert.match(server, /resolveStudentCourseEnrollment/); assert.match(server, /enrollment\.id !== submission\.data\.course_enrollment_id/); });
check("ZIP uploads require project or capstone context", () => assert.match(server, /upload\.extension === "zip".*assessmentProjectArchive/));
check("facilitator access checks actual offering assignment", () => { assert.match(server, /assertFacilitatorOfferingAccess/); assert.match(facilitatorDownload, /resolveFacilitatorAssessmentContext/); });
check("admin routes require existing admin authentication", () => { assert.match(adminDownload, /isAdminAuthenticated/); assert.match(adminAbsenceDownload, /isAdminAuthenticated/); });
check("absence ownership is relationship-based", () => { assert.match(server, /course_enrollments!inner\(student_enrollments!inner\(student_id\)\)/); assert.match(studentAbsenceDownload, /requireStudentAbsenceApi/); });
check("ordinary facilitator has no absence evidence route", () => assert.doesNotMatch(facilitatorDownload, /absence-evidence/));
check("submitted assessment file is immutable to the student", () => { assert.doesNotMatch(studentDownload + assessmentRoute, /export async function (DELETE|PATCH|PUT)/); assert.match(assessmentService, /hasValidatedFile/); });
check("upload cleanup is compensating and non-overwriting", () => { assert.match(server, /\.remove\(\[objectPath\]\)/); assert.match(server, /upsert: false/); assert.match(assessmentRoute, /rollbackStudentSubmission/); });
check("awards are private, versioned and status-gated", () => { assert.match(awardService, /randomUUID\(\)/); assert.match(awardService, /upsert: false/); assert.match(awardService, /award_status !== "issued"/); assert.doesNotMatch(publicAward, /document_storage_path|createSignedUrl/); });
check("student award access reuses own issued-award authorization", () => { assert.match(studentAwardDownload, /resolveStudentAssessmentApiContext/); assert.match(studentAwardDownload, /createOwnAwardDownloadUrl/); });
check("UI reports selected files and upload progress", () => { assert.match(assessmentUi + absenceUi, /Selected:/); assert.match(uploadUi, /upload\.onprogress/); });
check("service role is absent from browser components", () => assert.doesNotMatch(assessmentUi + absenceUi + uploadUi, /SUPABASE_SERVICE_ROLE_KEY/));
check("calm file errors are present", () => assert.match(server + assessmentRoute + absenceRoute, /Your file could not be uploaded\. Please check the file type and size and try again\./));
check("orphan audit is conservative and opt-in", () => { assert.match(orphanAudit, /minimumAgeMs = 24/); assert.match(orphanAudit, /generatedPath/); assert.match(orphanAudit, /PRIVATE_STORAGE_DELETE_ORPHANS/); assert.match(orphanAudit, /dry-run/); });

assert.equal(passed, 33);
console.log(`Private storage checks passed (${passed}).`);
