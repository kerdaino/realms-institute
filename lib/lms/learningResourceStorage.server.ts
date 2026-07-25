import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { isOneOf, readHttpUrl, readText, resourceTypes } from "@/lib/lms/adminConstants";
import { LmsAdminDataError } from "@/lib/lms/adminData";
import { isLearningResourceType } from "@/lib/lms/learningResources";
import { privateFileLimits, privateFileSignedUrlSeconds, privateStorageBuckets } from "@/lib/lms/privateFilePolicy";
import { validatePrivateUpload } from "@/lib/lms/privateStorage.server";
import { addSessionResource, type SessionActor } from "@/lib/lms/sessionService";

type Row = Record<string, unknown>;

function relation(value: unknown): Row {
  return Array.isArray(value) ? (value[0] as Row | undefined) ?? {} : value && typeof value === "object" ? value as Row : {};
}

function invalid(message: string): never {
  throw new LmsAdminDataError(message, 400);
}

export function publishToStudents(value: unknown) {
  return value !== false && value !== "false" && value !== "off" && value !== "0";
}

function resourceType(value: unknown, fallback: "link" | "other", existingTypesAllowed = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (!(existingTypesAllowed ? isOneOf(resourceTypes, value) : isLearningResourceType(value))) invalid("Choose a valid resource category.");
  return value;
}

export async function addExternalLearningResource(
  supabase: SupabaseClient,
  sessionId: string,
  body: Record<string, unknown>,
  actor: SessionActor,
) {
  const externalUrl = readHttpUrl(body.external_url);
  if (externalUrl === undefined) invalid("Enter a valid secure resource URL.");
  if (!externalUrl) invalid("A resource URL is required.");
  return addSessionResource(supabase, sessionId, {
    title: body.title,
    description: body.description,
    resource_type: resourceType(body.resource_type, "link", true),
    external_url: externalUrl,
    access_level: publishToStudents(body.publish_now) ? "enrolled_students" : "facilitators_only",
    sort_order: 0,
  }, actor);
}

export async function storeLearningResourceUpload(
  supabase: SupabaseClient,
  input: {
    sessionId: string;
    title: unknown;
    description: unknown;
    resourceType: unknown;
    publishNow: unknown;
    file: File;
    actor: SessionActor;
  },
) {
  const title = readText(input.title, 240);
  if (!title) invalid("A resource title is required.");
  const type = resourceType(input.resourceType, "other");
  const upload = await validatePrivateUpload(input.file, "learning_resource", privateFileLimits.learningResource);
  const session = await supabase
    .from("class_sessions")
    .select("id, cohort_course_id, cohort_courses(cohort_id)")
    .eq("id", input.sessionId)
    .maybeSingle();
  if (session.error || !session.data) throw new LmsAdminDataError("Class session not found.", 404);
  const offering = relation(session.data.cohort_courses);
  const cohortId = typeof offering.cohort_id === "string" ? offering.cohort_id : null;
  if (!cohortId) throw new LmsAdminDataError("The class session is not attached to a valid cohort offering.", 409);

  const resourceId = randomUUID();
  const objectPath = `cohort/${cohortId}/offering/${session.data.cohort_course_id}/session/${input.sessionId}/${resourceId}/${upload.filename}`;
  const stored = await supabase.storage.from(privateStorageBuckets.learningResource).upload(objectPath, upload.bytes, {
    contentType: upload.mimeType,
    cacheControl: "0",
    upsert: false,
  });
  if (stored.error) throw new LmsAdminDataError("The learning material could not be stored. Please try again.", 503);

  const saved = await supabase.from("session_resources").insert({
    id: resourceId,
    class_session_id: input.sessionId,
    title,
    description: readText(input.description),
    resource_type: type,
    external_url: null,
    storage_path: objectPath,
    file_name: upload.filename,
    mime_type: upload.mimeType,
    size_bytes: upload.size,
    sha256: upload.checksum,
    access_level: publishToStudents(input.publishNow) ? "enrolled_students" : "facilitators_only",
    sort_order: 0,
    is_active: true,
    created_by: input.actor.actorUserId ?? null,
    uploaded_by: input.actor.actorUserId ?? null,
    uploaded_at: new Date().toISOString(),
  }).select("*").single();
  if (saved.error || !saved.data) {
    await supabase.storage.from(privateStorageBuckets.learningResource).remove([objectPath]);
    throw new LmsAdminDataError("The learning material could not be added. Please try again.", 503);
  }

  const auditClient = input.actor.auditClient ?? supabase;
  await recordLmsAudit(auditClient, {
    action: "session_resource_added",
    entityType: "session_resource",
    entityId: resourceId,
    actorUserId: input.actor.actorUserId,
    metadata: {
      class_session_id: input.sessionId,
      resource_type: type,
      access_level: saved.data.access_level,
      actor: input.actor.actorLabel,
    },
  });
  await recordLmsAudit(auditClient, {
    action: "session_resource_file_uploaded",
    entityType: "session_resource",
    entityId: resourceId,
    actorUserId: input.actor.actorUserId,
    metadata: {
      class_session_id: input.sessionId,
      mime_type: upload.mimeType,
      size_bytes: upload.size,
      actor: input.actor.actorLabel,
    },
  });
  return saved.data;
}

async function resourceFile(supabase: SupabaseClient, resourceId: string, studentVisibleOnly: boolean) {
  let query = supabase
    .from("session_resources")
    .select("id, class_session_id, storage_path, file_name, mime_type, is_active, access_level, class_sessions!inner(cohort_course_id, visibility_status)")
    .eq("id", resourceId);
  if (studentVisibleOnly) query = query.eq("is_active", true).eq("access_level", "enrolled_students");
  const result = await query.maybeSingle();
  if (result.error || !result.data?.storage_path) throw new LmsAdminDataError("This learning material is no longer available.", 404);
  return result.data;
}

async function signedLearningResourceUrl(supabase: SupabaseClient, storagePath: string, filename: string | null) {
  const signed = await supabase.storage
    .from(privateStorageBuckets.learningResource)
    .createSignedUrl(storagePath, privateFileSignedUrlSeconds, { download: filename || "REALMS-learning-material" });
  if (signed.error || !signed.data?.signedUrl) throw new LmsAdminDataError("This learning material is no longer available.", 404);
  return signed.data.signedUrl;
}

export async function createStudentLearningResourceDownload(supabase: SupabaseClient, profileId: string, resourceId: string) {
  const resource = await resourceFile(supabase, resourceId, true);
  const session = relation(resource.class_sessions);
  const offeringId = typeof session.cohort_course_id === "string" ? session.cohort_course_id : null;
  if (!offeringId || session.visibility_status !== "enrolled_only") throw new LmsAdminDataError("This learning material is no longer available.", 404);

  const student = await supabase.from("students").select("id").eq("profile_id", profileId).maybeSingle();
  if (student.error || !student.data) throw new LmsAdminDataError("Student access required.", 403);
  const enrollments = await supabase
    .from("student_enrollments")
    .select("id")
    .eq("student_id", student.data.id)
    .in("enrolment_status", ["active", "enrolled", "matriculated"]);
  if (enrollments.error) throw new LmsAdminDataError("Your enrolment could not be verified.", 503);
  const enrollmentIds = (enrollments.data ?? []).map((item) => item.id);
  if (!enrollmentIds.length) throw new LmsAdminDataError("You do not have permission to access this learning material.", 403);
  const courseEnrollment = await supabase
    .from("course_enrollments")
    .select("id")
    .in("student_enrollment_id", enrollmentIds)
    .eq("cohort_course_id", offeringId)
    .in("enrollment_status", ["active", "enrolled"])
    .limit(1)
    .maybeSingle();
  if (courseEnrollment.error || !courseEnrollment.data) throw new LmsAdminDataError("You do not have permission to access this learning material.", 403);
  return signedLearningResourceUrl(supabase, resource.storage_path, resource.file_name);
}

export async function loadManagedLearningResourceFile(supabase: SupabaseClient, resourceId: string) {
  return resourceFile(supabase, resourceId, false);
}

export async function createManagedLearningResourceDownload(supabase: SupabaseClient, resourceId: string) {
  const resource = await resourceFile(supabase, resourceId, false);
  return signedLearningResourceUrl(supabase, resource.storage_path, resource.file_name);
}
