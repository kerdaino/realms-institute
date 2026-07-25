import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { LmsAdminDataError } from "@/lib/lms/adminData";
import { assertFacilitatorOfferingAccess, resolveStudentCourseEnrollment } from "@/lib/lms/assessmentService";
import { assessmentUploadLimit, fileExtension, isDangerousFileExtension, privateFileContentMatches, privateFileLimits, privateFileSignedUrlSeconds, privateStorageBuckets, safeDisplayFilename } from "@/lib/lms/privateFilePolicy";

type Row = Record<string, unknown>;
export type ValidatedUpload = { bytes: Uint8Array; checksum: string; filename: string; mimeType: string; size: number; extension: string };

const assessmentMimeByExtension: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  txt: ["text/plain"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  zip: ["application/zip", "application/x-zip-compressed"],
};
const absenceMimeByExtension: Record<string, readonly string[]> = {
  pdf: ["application/pdf"], jpg: ["image/jpeg"], jpeg: ["image/jpeg"], png: ["image/png"], webp: ["image/webp"],
};
const learningResourceMimeByExtension: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  txt: ["text/plain"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
};

function relation(value: unknown): Row { return Array.isArray(value) ? (value[0] as Row | undefined) ?? {} : value && typeof value === "object" ? value as Row : {}; }
function storageError(message = "Your file could not be uploaded. Please check the file type and size and try again.", status = 400): never { throw new LmsAdminDataError(message, status); }
export async function validatePrivateUpload(file: File, area: "assessment" | "absence" | "learning_resource", maximumBytes: number): Promise<ValidatedUpload> {
  if (!(file instanceof File) || file.size <= 0) storageError();
  if (file.size > maximumBytes) storageError();
  const filename = safeDisplayFilename(file.name);
  if (isDangerousFileExtension(filename)) storageError();
  const extension = fileExtension(filename);
  const allowed = area === "assessment" ? assessmentMimeByExtension : area === "absence" ? absenceMimeByExtension : learningResourceMimeByExtension;
  if (!allowed[extension]?.includes(file.type.toLowerCase())) storageError();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!privateFileContentMatches(extension, bytes)) storageError();
  return { bytes, checksum: createHash("sha256").update(bytes).digest("hex"), filename, mimeType: allowed[extension][0], size: bytes.byteLength, extension };
}

export async function prepareStudentAssessmentUpload(supabase: SupabaseClient, profileId: string, assignmentId: string, file: File) {
  const [student, assignment] = await Promise.all([
    supabase.from("students").select("id").eq("profile_id", profileId).maybeSingle(),
    supabase.from("assignments").select("id, cohort_course_id, assignment_status, assignment_type, assessment_category, submission_requirements").eq("id", assignmentId).maybeSingle(),
  ]);
  if (student.error || !student.data) throw new LmsAdminDataError("Student access required.", 403);
  if (assignment.error || !assignment.data || assignment.data.assignment_status !== "published") throw new LmsAdminDataError("This assignment is not currently available.", 404);
  await resolveStudentCourseEnrollment(supabase, profileId, assignment.data.cohort_course_id);
  const requirements = assignment.data.submission_requirements && typeof assignment.data.submission_requirements === "object" ? assignment.data.submission_requirements as Row : {};
  if (requirements.file_upload_allowed !== true) throw new LmsAdminDataError("This assignment does not accept file attachments.", 409);
  const maximum = assessmentUploadLimit(assignment.data.assignment_type, assignment.data.assessment_category);
  const upload = await validatePrivateUpload(file, "assessment", maximum);
  if (upload.extension === "zip" && maximum !== privateFileLimits.assessmentProjectArchive) throw new LmsAdminDataError("ZIP archives are accepted only for project or capstone assignments.", 409);
  return { studentId: student.data.id, upload };
}

export async function storeStudentAssessmentUpload(supabase: SupabaseClient, input: { profileId: string; studentId: string; submissionId: string; upload: ValidatedUpload }) {
  const submission = await supabase.from("assignment_submissions").select("id, assignment_id, course_enrollment_id, submission_status, assignments(cohort_course_id)").eq("id", input.submissionId).maybeSingle();
  if (submission.error || !submission.data || submission.data.submission_status !== "submitted") throw new LmsAdminDataError("This submission can no longer accept files.", 409);
  const assignment = relation(submission.data.assignments);
  const enrollment = await resolveStudentCourseEnrollment(supabase, input.profileId, String(assignment.cohort_course_id));
  if (enrollment.id !== submission.data.course_enrollment_id) throw new LmsAdminDataError("You do not have permission to access this file.", 403);
  const objectPath = `${input.studentId}/${input.submissionId}/${randomUUID()}-${input.upload.filename}`;
  const stored = await supabase.storage.from(privateStorageBuckets.assessment).upload(objectPath, input.upload.bytes, { contentType: input.upload.mimeType, cacheControl: "0", upsert: false });
  if (stored.error) storageError(undefined, 503);
  const artifact = await supabase.from("assignment_submission_artifacts").insert({ submission_id: input.submissionId, title: input.upload.filename, artifact_type: "private_file", external_url: null, storage_bucket: privateStorageBuckets.assessment, storage_path: objectPath, file_name: input.upload.filename, mime_type: input.upload.mimeType, size_bytes: input.upload.size, sha256: input.upload.checksum, artifact_status: "active", uploaded_by: input.profileId, uploaded_at: new Date().toISOString() }).select("id, title, artifact_type, file_name, mime_type, size_bytes, created_at").single();
  if (artifact.error || !artifact.data) {
    await supabase.storage.from(privateStorageBuckets.assessment).remove([objectPath]);
    storageError(undefined, 503);
  }
  return artifact.data;
}

export async function rollbackStudentSubmission(supabase: SupabaseClient, submissionId: string) {
  const removed = await supabase.from("assignment_submissions").delete().eq("id", submissionId).eq("submission_status", "submitted");
  if (removed.error) console.error("Failed assignment upload rollback requires review", { submissionId, code: removed.error.code });
}

async function ownedAbsenceRequest(supabase: SupabaseClient, profileId: string, requestId: string) {
  const student = await supabase.from("students").select("id").eq("profile_id", profileId).maybeSingle();
  if (student.error || !student.data) throw new LmsAdminDataError("Student access required.", 403);
  const request = await supabase.from("absence_requests").select("id, request_status, course_enrollment_id, course_enrollments!inner(student_enrollments!inner(student_id))").eq("id", requestId).eq("course_enrollments.student_enrollments.student_id", student.data.id).maybeSingle();
  if (request.error || !request.data) throw new LmsAdminDataError("You do not have permission to access this file.", 403);
  return { request: request.data, studentId: student.data.id };
}

export async function storeStudentAbsenceUpload(supabase: SupabaseClient, profileId: string, requestId: string, file: File, input: { title: string; description: string }) {
  const context = await ownedAbsenceRequest(supabase, profileId, requestId);
  if (!["draft", "submitted", "under_review", "more_information_required"].includes(context.request.request_status)) throw new LmsAdminDataError("Evidence can no longer be added to this request.", 409);
  const title = input.title.trim().slice(0, 240); const description = input.description.trim().slice(0, 2000);
  if (!title || !description) throw new LmsAdminDataError("Evidence title and a concise description are required.", 400);
  const upload = await validatePrivateUpload(file, "absence", privateFileLimits.absenceEvidence);
  const objectPath = `${context.studentId}/${requestId}/${randomUUID()}-${upload.filename}`;
  const stored = await supabase.storage.from(privateStorageBuckets.absence).upload(objectPath, upload.bytes, { contentType: upload.mimeType, cacheControl: "0", upsert: false });
  if (stored.error) storageError(undefined, 503);
  const evidence = await supabase.from("absence_request_evidence").insert({ absence_request_id: requestId, title, description, evidence_type: "private_file", external_url: null, storage_bucket: privateStorageBuckets.absence, storage_path: objectPath, file_name: upload.filename, mime_type: upload.mimeType, size_bytes: upload.size, sha256: upload.checksum, evidence_status: "active", uploaded_by: profileId, uploaded_at: new Date().toISOString() }).select("id, title, description, evidence_type, file_name, mime_type, size_bytes, created_at").single();
  if (evidence.error || !evidence.data) {
    await supabase.storage.from(privateStorageBuckets.absence).remove([objectPath]);
    storageError(undefined, 503);
  }
  return evidence.data;
}

async function artifactRecord(supabase: SupabaseClient, artifactId: string) {
  const result = await supabase.from("assignment_submission_artifacts").select("id, submission_id, storage_bucket, storage_path, file_name, artifact_status").eq("id", artifactId).maybeSingle();
  if (result.error || !result.data || result.data.artifact_status !== "active" || !result.data.storage_path) throw new LmsAdminDataError("This file is no longer available.", 404);
  return result.data;
}

async function signedDownload(supabase: SupabaseClient, bucket: string, path: string, filename: string) {
  const signed = await supabase.storage.from(bucket).createSignedUrl(path, privateFileSignedUrlSeconds, { download: filename });
  if (signed.error || !signed.data?.signedUrl) throw new LmsAdminDataError("This file is no longer available.", 404);
  return signed.data.signedUrl;
}

export async function createStudentAssessmentDownload(supabase: SupabaseClient, profileId: string, artifactId: string) {
  const artifact = await artifactRecord(supabase, artifactId);
  const submission = await supabase.from("assignment_submissions").select("course_enrollment_id, assignments(cohort_course_id)").eq("id", artifact.submission_id).maybeSingle();
  if (submission.error || !submission.data) throw new LmsAdminDataError("This file is no longer available.", 404);
  const enrollment = await resolveStudentCourseEnrollment(supabase, profileId, String(relation(submission.data.assignments).cohort_course_id));
  if (enrollment.id !== submission.data.course_enrollment_id) throw new LmsAdminDataError("You do not have permission to access this file.", 403);
  return signedDownload(supabase, privateStorageBuckets.assessment, artifact.storage_path, artifact.file_name || "assessment-file");
}

export async function createFacilitatorAssessmentDownload(supabase: SupabaseClient, facilitatorId: string, artifactId: string) {
  const artifact = await artifactRecord(supabase, artifactId);
  const submission = await supabase.from("assignment_submissions").select("assignments(cohort_course_id)").eq("id", artifact.submission_id).maybeSingle();
  const offeringId = String(relation(submission.data?.assignments).cohort_course_id || "");
  if (submission.error || !offeringId) throw new LmsAdminDataError("This file is no longer available.", 404);
  await assertFacilitatorOfferingAccess(supabase, facilitatorId, offeringId);
  return signedDownload(supabase, privateStorageBuckets.assessment, artifact.storage_path, artifact.file_name || "assessment-file");
}

export async function createAdminAssessmentDownload(supabase: SupabaseClient, artifactId: string) {
  const artifact = await artifactRecord(supabase, artifactId);
  return signedDownload(supabase, privateStorageBuckets.assessment, artifact.storage_path, artifact.file_name || "assessment-file");
}

async function absenceEvidenceRecord(supabase: SupabaseClient, evidenceId: string) {
  const result = await supabase.from("absence_request_evidence").select("id, absence_request_id, storage_bucket, storage_path, file_name, evidence_status").eq("id", evidenceId).maybeSingle();
  if (result.error || !result.data || result.data.evidence_status !== "active" || !result.data.storage_path) throw new LmsAdminDataError("This file is no longer available.", 404);
  return result.data;
}

export async function createStudentAbsenceDownload(supabase: SupabaseClient, profileId: string, evidenceId: string) {
  const evidence = await absenceEvidenceRecord(supabase, evidenceId);
  await ownedAbsenceRequest(supabase, profileId, evidence.absence_request_id);
  return signedDownload(supabase, privateStorageBuckets.absence, evidence.storage_path, evidence.file_name || "absence-evidence");
}

export async function createAdminAbsenceDownload(supabase: SupabaseClient, evidenceId: string) {
  const evidence = await absenceEvidenceRecord(supabase, evidenceId);
  return signedDownload(supabase, privateStorageBuckets.absence, evidence.storage_path, evidence.file_name || "absence-evidence");
}
