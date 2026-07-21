import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { LmsAdminDataError } from "@/lib/lms/adminData";
import { renderInstitutionalCertificatePdf, type CertificateSignature } from "@/lib/lms/awardPdf";
import { awardDisclaimer, awardingInstitution, institutionalAwardTitle, institutionalAwardType, templateIssuanceBlockingReasons } from "@/lib/lms/graduation";
import type { GraduationActor } from "@/lib/lms/graduationService";
import { privateFileContentMatches, privateFileLimits, privateFileSignedUrlSeconds, privateStorageBuckets } from "@/lib/lms/privateFilePolicy";

type Row = Record<string, unknown>;
const awardBucket = privateStorageBuckets.award;

function object(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function relation(value: unknown): Row { return Array.isArray(value) ? object(value[0]) : object(value); }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function requiredText(value: unknown, message: string, minimum = 1, maximum = 5_000) { const result = text(value); if (!result || result.length < minimum) throw new LmsAdminDataError(message, 400); return result.slice(0, maximum); }
function fail(error: { code?: string } | null, message: string) { if (error) throw new LmsAdminDataError(message); }
function actorReference(actor: GraduationActor) { return actor.actorUserId ?? actor.actorLabel; }
function now() { return new Date().toISOString(); }
function claimFromTemplate(template: Row, award: Row) { return String(template.award_claim_text).replaceAll("{{recipient_name}}", String(award.recipient_legal_name)).replaceAll("{{discipleship_route}}", String(award.discipleship_route).replaceAll("_", " ")).replaceAll("{{skill_pathway}}", String(award.skill_pathway).replaceAll("_", " ")); }

async function issuanceEvent(supabase: SupabaseClient, awardId: string, eventType: string, previous: Row, next: Row, reason: string | null, actor: GraduationActor, approvedBy?: string | null) {
  const saved = await supabase.from("award_issuance_events").insert({ institutional_award_id: awardId, event_type: eventType, previous_state: previous, new_state: next, reason, initiated_by: actorReference(actor), approved_by: approvedBy ?? null });
  fail(saved.error, "Award history could not be saved.");
}

async function approvedTemplate(supabase: SupabaseClient, templateId?: string | null) {
  let query = supabase.from("certificate_templates").select("*").eq("template_status", "approved");
  if (templateId) query = query.eq("id", templateId);
  const result = await query.order("approved_at", { ascending: false }).limit(1).maybeSingle();
  fail(result.error, "Certificate template could not be loaded.");
  const template = result.data ? object(result.data) : null;
  const blockers = templateIssuanceBlockingReasons(template);
  if (blockers.length) throw new LmsAdminDataError(`Official award creation is blocked: ${blockers.join(" ")}`, 409);
  return template!;
}

export async function approveCertificateTemplate(supabase: SupabaseClient, templateId: string, body: Row, actor: GraduationActor) {
  const current = await supabase.from("certificate_templates").select("*").eq("id", templateId).maybeSingle();
  fail(current.error, "Certificate template could not be loaded.");
  if (!current.data) throw new LmsAdminDataError("Certificate template not found.", 404);
  const blockers = templateIssuanceBlockingReasons({ ...current.data, template_status: "approved" });
  if (blockers.length) throw new LmsAdminDataError(`Template approval is blocked: ${blockers.join(" ")}`, 409);
  requiredText(body.approval_reference, "Record the template approval reference.", 3, 500);
  const saved = await supabase.from("certificate_templates").update({ template_status: "approved", approved_at: now(), approved_by: actorReference(actor), updated_at: now() }).eq("id", templateId).select("*").single();
  fail(saved.error, "Certificate template approval could not be recorded.");
  await recordLmsAudit(supabase, { action: "certificate_template_approved", entityType: "certificate_template", entityId: templateId, actorUserId: actor.actorUserId, metadata: { template_version: current.data.template_version, approval_reference: text(body.approval_reference) } });
  return saved.data;
}

export async function createInstitutionalAward(supabase: SupabaseClient, alumniProgrammeRecordId: string, actor: GraduationActor, templateId?: string | null) {
  const programmeQuery = await supabase.from("alumni_programme_records").select("*, alumni(*, students!inner(id, profile_id, legal_name)), graduation_confirmations(*), student_programme_results(*)").eq("id", alumniProgrammeRecordId).maybeSingle();
  fail(programmeQuery.error, "Alumni programme record could not be loaded.");
  if (!programmeQuery.data) throw new LmsAdminDataError("Alumni programme record not found.", 404);
  const programme = object(programmeQuery.data); const alumni = relation(programme.alumni); const student = relation(alumni.students); const confirmation = relation(programme.graduation_confirmations); const result = relation(programme.student_programme_results);
  if (confirmation.confirmation_status !== "completed") throw new LmsAdminDataError("Graduation processing must be completed before an award can be created.", 409);
  if (!confirmation.identity_reconciled || !confirmation.academic_record_reconciled || result.result_status !== "published" || result.result_outcome !== "eligible_for_completion") throw new LmsAdminDataError("The reconciled published completion record is not ready for an award.", 409);
  const existing = await supabase.from("institutional_awards").select("*").eq("alumni_programme_record_id", alumniProgrammeRecordId).in("award_status", ["draft", "approved", "issued"]).is("supersedes_award_id", null).maybeSingle();
  fail(existing.error, "Existing award could not be checked.");
  if (existing.data) return existing.data;
  const template = await approvedTemplate(supabase, templateId);
  const saved = await supabase.from("institutional_awards").insert({ alumni_programme_record_id: alumniProgrammeRecordId, graduation_confirmation_id: confirmation.id, student_enrollment_id: programme.student_enrollment_id, certificate_template_id: template.id, award_type: institutionalAwardType, award_title: institutionalAwardTitle, awarding_institution: awardingInstitution, programme_name: programme.programme_name, recipient_legal_name: student.legal_name, cohort_name_snapshot: programme.cohort_name_snapshot, discipleship_route: programme.discipleship_route, skill_pathway: programme.skill_pathway, result_total_points: result.total_points, award_status: "draft", document_status: "not_generated", template_version_snapshot: template.template_version }).select("*").single();
  fail(saved.error, "Institutional award could not be created.");
  await issuanceEvent(supabase, saved.data.id, "draft_created", {}, object(saved.data), "Created from a completed reconciled graduation record.", actor);
  await recordLmsAudit(supabase, { action: "institutional_award_created", entityType: "institutional_award", entityId: saved.data.id, actorUserId: actor.actorUserId, metadata: { alumni_programme_record_id: alumniProgrammeRecordId, template_version: template.template_version } });
  return saved.data;
}

async function downloadConfiguredAsset(supabase: SupabaseClient, storedPath: string) {
  const [bucket, ...parts] = storedPath.split("/");
  const objectPath = bucket === awardBucket ? parts.join("/") : storedPath;
  const result = await supabase.storage.from(awardBucket).download(objectPath);
  if (result.error || !result.data) throw new LmsAdminDataError("An approved certificate asset could not be loaded.", 409);
  return new Uint8Array(await result.data.arrayBuffer());
}

async function loadSignatures(supabase: SupabaseClient, configuration: unknown) {
  const signatures: CertificateSignature[] = [];
  for (const item of configuration as Array<Record<string, unknown>>) signatures.push({ name: String(item.name), role: String(item.role), imageBytes: await downloadConfiguredAsset(supabase, String(item.asset_path)) });
  return signatures;
}

export async function generateAwardDocument(supabase: SupabaseClient, awardId: string, actor: GraduationActor) {
  const awardQuery = await supabase.from("institutional_awards").select("*, certificate_templates(*), alumni_programme_records!institutional_awards_alumni_programme_record_id_fkey(alumni_id, graduation_date, completion_date)").eq("id", awardId).maybeSingle();
  fail(awardQuery.error, "Institutional award could not be loaded.");
  if (!awardQuery.data) throw new LmsAdminDataError("Institutional award not found.", 404);
  const award = object(awardQuery.data); const template = relation(award.certificate_templates); const programme = relation(award.alumni_programme_records);
  if (!["draft", "approved"].includes(String(award.award_status))) throw new LmsAdminDataError("Only a draft or approved, unissued award can generate a document.", 409);
  const blockers = templateIssuanceBlockingReasons(template); if (blockers.length) throw new LmsAdminDataError(`Document generation is blocked: ${blockers.join(" ")}`, 409);
  const buckets = await supabase.storage.listBuckets();
  if (buckets.error || !buckets.data?.some((bucket) => bucket.name === awardBucket && bucket.public === false)) throw new LmsAdminDataError("The private institutional-awards storage bucket is not configured.", 503);
  const generation = await supabase.from("institutional_awards").update({ document_status: "generation_pending", updated_at: now() }).eq("id", awardId);
  fail(generation.error, "Certificate document generation could not be started.");
  try {
    const logoBytes = new Uint8Array(await readFile(path.join(process.cwd(), "public/images/realms-logo.png")));
    const signatures = await loadSignatures(supabase, template.signature_configuration);
    const backgroundBytes = template.background_asset_path ? await downloadConfiguredAsset(supabase, String(template.background_asset_path)) : null;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
    if (!siteUrl) throw new LmsAdminDataError("The public site URL is required for certificate verification.", 503);
    const verificationUrl = `${siteUrl}/verify-certificate/${encodeURIComponent(String(award.verification_code))}`;
    const bytes = await renderInstitutionalCertificatePdf({ awardTitle: String(award.award_title), recipientLegalName: String(award.recipient_legal_name), claimText: claimFromTemplate(template, award), programmeName: String(award.programme_name), cohortName: String(award.cohort_name_snapshot), discipleshipRoute: String(award.discipleship_route), skillPathway: String(award.skill_pathway), issueDate: String(programme.graduation_date ?? programme.completion_date), awardNumber: String(award.award_number), verificationUrl, verificationFooter: String(template.verification_footer_text || awardDisclaimer), logoBytes, backgroundBytes, signatures });
    if (bytes.byteLength > privateFileLimits.certificatePdf || !privateFileContentMatches("pdf", bytes)) throw new LmsAdminDataError("The generated certificate did not pass the private-file safety checks.", 409);
    const fileName = `${String(award.award_number).replace(/[^A-Za-z0-9-]/g, "-")}.pdf`;
    const storagePath = `${programme.alumni_id}/${award.id}/${randomUUID()}.pdf`;
    const uploaded = await supabase.storage.from(awardBucket).upload(storagePath, bytes, { contentType: "application/pdf", upsert: false, cacheControl: "0" });
    if (uploaded.error) throw new LmsAdminDataError("The certificate document could not be stored privately.");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const saved = await supabase.from("institutional_awards").update({ document_status: "generated", document_storage_bucket: awardBucket, document_storage_path: storagePath, document_file_name: fileName, document_mime_type: "application/pdf", document_size_bytes: bytes.byteLength, document_uploaded_at: now(), document_sha256: sha256, template_version_snapshot: template.template_version, qr_verification_url: verificationUrl, updated_at: now() }).eq("id", awardId).select("*").single();
    if (saved.error || !saved.data) {
      await supabase.storage.from(awardBucket).remove([storagePath]);
      throw new LmsAdminDataError("Certificate document record could not be finalised.");
    }
    const previousPath = typeof award.document_storage_path === "string" ? award.document_storage_path : null;
    await issuanceEvent(supabase, awardId, "document_generated", award, object(saved.data), "Generated from the approved template and reconciled award snapshot.", actor);
    await recordLmsAudit(supabase, { action: "certificate_document_generated", entityType: "institutional_award", entityId: awardId, actorUserId: actor.actorUserId, metadata: { template_version: template.template_version, sha256_recorded: true } });
    if (previousPath && previousPath !== storagePath) {
      const removed = await supabase.storage.from(awardBucket).remove([previousPath]);
      if (removed.error) console.error("Superseded draft award object requires cleanup", { awardId, code: removed.error.message });
    }
    return saved.data;
  } catch (error) {
    await supabase.from("institutional_awards").update({ document_status: "generation_failed", updated_at: now() }).eq("id", awardId);
    throw error;
  }
}

export async function transitionInstitutionalAward(supabase: SupabaseClient, awardId: string, body: Row, actor: GraduationActor) {
  const action = requiredText(body.action, "Choose an award action.", 2, 30);
  const currentQuery = await supabase.from("institutional_awards").select("*, certificate_templates(*)").eq("id", awardId).maybeSingle();
  fail(currentQuery.error, "Institutional award could not be loaded.");
  if (!currentQuery.data) throw new LmsAdminDataError("Institutional award not found.", 404);
  const current = object(currentQuery.data); const template = relation(current.certificate_templates); const timestamp = now();
  if (templateIssuanceBlockingReasons(template).length) throw new LmsAdminDataError("The approved template configuration is no longer valid.", 409);
  if (action === "review") {
    if (current.award_status !== "draft" || current.document_status !== "generated") throw new LmsAdminDataError("Generate the draft document before review.", 409);
    await issuanceEvent(supabase, awardId, "document_reviewed", current, current, requiredText(body.reason, "Record the document review note.", 10, 2000), actor);
    return currentQuery.data;
  }
  if (action === "approve") {
    if (current.award_status !== "draft" || current.document_status !== "generated") throw new LmsAdminDataError("A reviewed generated document is required before approval.", 409);
    const review = await supabase.from("award_issuance_events").select("initiated_by").eq("institutional_award_id", awardId).eq("event_type", "document_reviewed").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!review.data) throw new LmsAdminDataError("Record a document review before approval.", 409);
    if (review.data.initiated_by === actorReference(actor)) throw new LmsAdminDataError("The document reviewer and award approver must be different authorised people.", 409);
    const saved = await supabase.from("institutional_awards").update({ award_status: "approved", updated_at: timestamp }).eq("id", awardId).select("*").single(); fail(saved.error, "Award approval could not be recorded.");
    await issuanceEvent(supabase, awardId, "approved", current, object(saved.data), requiredText(body.reason, "Record the award approval basis.", 10, 2000), actor, actorReference(actor));
    await recordLmsAudit(supabase, { action: "institutional_award_approved", entityType: "institutional_award", entityId: awardId, actorUserId: actor.actorUserId, metadata: { document_sha256_present: Boolean(current.document_sha256) } });
    return saved.data;
  }
  if (action === "issue") {
    if (current.award_status !== "approved" || current.document_status !== "generated") throw new LmsAdminDataError("Only an approved award with a generated document can be issued.", 409);
    const approval = await supabase.from("award_issuance_events").select("approved_by").eq("institutional_award_id", awardId).eq("event_type", "approved").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (approval.data?.approved_by === actorReference(actor)) throw new LmsAdminDataError("The award approver and issuer must be different authorised people.", 409);
    const saved = await supabase.from("institutional_awards").update({ award_status: "issued", issued_at: timestamp, issued_by: actorReference(actor), updated_at: timestamp }).eq("id", awardId).select("*").single(); fail(saved.error, "Award issuance could not be recorded.");
    if (current.supersedes_award_id) {
      const old = await supabase.from("institutional_awards").update({ award_status: "superseded", superseded_at: timestamp, superseded_by: actorReference(actor), updated_at: timestamp }).eq("id", String(current.supersedes_award_id)); fail(old.error, "The prior award could not be superseded.");
      await recordLmsAudit(supabase, { action: "institutional_award_superseded", entityType: "institutional_award", entityId: String(current.supersedes_award_id), actorUserId: actor.actorUserId, metadata: { successor_award_id: awardId } });
    }
    const programme = await supabase.from("alumni_programme_records").update({ primary_award_id: awardId, updated_at: timestamp }).eq("id", String(current.alumni_programme_record_id)); fail(programme.error, "The primary alumni award reference could not be updated.");
    await issuanceEvent(supabase, awardId, "issued", current, object(saved.data), text(body.reason), actor);
    await recordLmsAudit(supabase, { action: "institutional_award_issued", entityType: "institutional_award", entityId: awardId, actorUserId: actor.actorUserId, metadata: { corrected_award: Boolean(current.supersedes_award_id) } });
    return saved.data;
  }
  throw new LmsAdminDataError("Choose a supported award transition.", 400);
}

export async function createCorrectedAward(supabase: SupabaseClient, awardId: string, body: Row, actor: GraduationActor) {
  const oldQuery = await supabase.from("institutional_awards").select("*, alumni_programme_records!institutional_awards_alumni_programme_record_id_fkey(alumni(*, students!inner(legal_name)))").eq("id", awardId).maybeSingle();
  fail(oldQuery.error, "Issued award could not be loaded.");
  if (!oldQuery.data || oldQuery.data.award_status !== "issued") throw new LmsAdminDataError("Only an issued award can enter the correction workflow.", 409);
  const old = object(oldQuery.data); const programme = relation(old.alumni_programme_records); const alumni = relation(programme.alumni); const student = relation(alumni.students);
  const reason = requiredText(body.reason, "Record the award correction reason.", 15, 3000); requiredText(body.decision_reference, "Record the correction decision reference.", 3, 500);
  if (!student.legal_name) throw new LmsAdminDataError("Correct the controlled student identity record before creating the replacement award.", 409);
  const existing = await supabase.from("institutional_awards").select("*").eq("supersedes_award_id", awardId).in("award_status", ["draft", "approved", "issued"]).maybeSingle();
  if (existing.data) return existing.data;
  const saved = await supabase.from("institutional_awards").insert({ alumni_programme_record_id: old.alumni_programme_record_id, graduation_confirmation_id: old.graduation_confirmation_id, student_enrollment_id: old.student_enrollment_id, certificate_template_id: old.certificate_template_id, award_type: old.award_type, award_title: old.award_title, awarding_institution: old.awarding_institution, programme_name: old.programme_name, recipient_legal_name: student.legal_name, cohort_name_snapshot: old.cohort_name_snapshot, discipleship_route: old.discipleship_route, skill_pathway: old.skill_pathway, result_total_points: old.result_total_points, award_status: "draft", document_status: "not_generated", template_version_snapshot: old.template_version_snapshot, supersedes_award_id: awardId }).select("*").single();
  fail(saved.error, "Corrected award could not be prepared.");
  await issuanceEvent(supabase, saved.data.id, "correction_initiated", old, object(saved.data), `${reason} Decision reference: ${text(body.decision_reference)}`, actor);
  await recordLmsAudit(supabase, { action: "institutional_award_corrected", entityType: "institutional_award", entityId: saved.data.id, actorUserId: actor.actorUserId, metadata: { supersedes_award_id: awardId, decision_reference: text(body.decision_reference) } });
  return saved.data;
}

export async function revokeInstitutionalAward(supabase: SupabaseClient, awardId: string, body: Row, actor: GraduationActor) {
  const current = await supabase.from("institutional_awards").select("*").eq("id", awardId).maybeSingle(); fail(current.error, "Award could not be loaded.");
  if (!current.data || current.data.award_status !== "issued") throw new LmsAdminDataError("Only a currently issued award can be revoked.", 409);
  const basis = requiredText(body.basis, "Record the authorised revocation basis.", 20, 3000); const reference = requiredText(body.decision_reference, "Record the revocation decision reference.", 3, 500); requiredText(body.communication_record, "Record how the alumnus was informed.", 10, 2000);
  const saved = await supabase.from("institutional_awards").update({ award_status: "revoked", revoked_at: now(), revoked_by: actorReference(actor), revocation_reason: `${basis} Decision reference: ${reference}`, updated_at: now() }).eq("id", awardId).select("*").single(); fail(saved.error, "Award revocation could not be recorded.");
  await issuanceEvent(supabase, awardId, "revoked", object(current.data), object(saved.data), `${basis} Decision reference: ${reference}`, actor, actorReference(actor));
  await recordLmsAudit(supabase, { action: "institutional_award_revoked", entityType: "institutional_award", entityId: awardId, actorUserId: actor.actorUserId, metadata: { decision_reference: reference, alumnus_communicated: true } });
  return saved.data;
}

export async function createOwnAwardDownloadUrl(supabase: SupabaseClient, awardId: string, profileId: string) {
  const award = await supabase.from("institutional_awards").select("id, award_status, document_status, document_storage_path, alumni_programme_records!institutional_awards_alumni_programme_record_id_fkey!inner(alumni!inner(student_id, students!inner(profile_id)))").eq("id", awardId).maybeSingle();
  fail(award.error, "Award could not be loaded.");
  if (!award.data || award.data.award_status !== "issued" || award.data.document_status !== "generated" || !award.data.document_storage_path) throw new LmsAdminDataError("This certificate is not available for download.", 404);
  const programme = relation(award.data.alumni_programme_records); const alumni = relation(programme.alumni); const student = relation(alumni.students);
  if (student.profile_id !== profileId) throw new LmsAdminDataError("This certificate does not belong to your alumni account.", 403);
  const signed = await supabase.storage.from(awardBucket).createSignedUrl(award.data.document_storage_path, privateFileSignedUrlSeconds, { download: true });
  if (signed.error || !signed.data?.signedUrl) throw new LmsAdminDataError("A secure certificate download could not be prepared.");
  return signed.data.signedUrl;
}

export async function createAdminAwardDownloadUrl(supabase: SupabaseClient, awardId: string) {
  const award = await supabase.from("institutional_awards").select("id, document_status, document_storage_bucket, document_storage_path, document_file_name").eq("id", awardId).maybeSingle();
  fail(award.error, "Award could not be loaded.");
  if (!award.data || award.data.document_status !== "generated" || !award.data.document_storage_path) throw new LmsAdminDataError("This file is no longer available.", 404);
  const signed = await supabase.storage.from(awardBucket).createSignedUrl(award.data.document_storage_path, privateFileSignedUrlSeconds, { download: award.data.document_file_name || "REALMS-certificate.pdf" });
  if (signed.error || !signed.data?.signedUrl) throw new LmsAdminDataError("This file is no longer available.", 404);
  return signed.data.signedUrl;
}

export async function verifyPublicAward(supabase: SupabaseClient, input: string) {
  const value = input.trim().toUpperCase();
  if (!/^[A-Z0-9-]{8,100}$/.test(value)) return { status: "not_found" as const };
  const query = await supabase.from("institutional_awards").select("id, award_status, recipient_legal_name, programme_name, cohort_name_snapshot, discipleship_route, skill_pathway, issued_at, award_number, awarding_institution").or(`verification_code.ilike.${value},award_number.ilike.${value}`).limit(1).maybeSingle();
  fail(query.error, "Certificate verification is temporarily unavailable.");
  if (!query.data || !["issued", "superseded", "revoked"].includes(query.data.award_status)) return { status: "not_found" as const };
  const searchedHash = createHash("sha256").update(value).digest("hex");
  const event = await supabase.from("award_verification_events").insert({ institutional_award_id: query.data.id, searched_value_hash: searchedHash, verification_outcome: query.data.award_status === "issued" ? "valid" : query.data.award_status });
  if (event.error) console.error("Privacy-minimised award verification event failed", { code: event.error.code });
  await recordLmsAudit(supabase, { action: "certificate_publicly_verified", entityType: "institutional_award", entityId: query.data.id, metadata: { verification_outcome: query.data.award_status === "issued" ? "valid" : query.data.award_status } });
  if (query.data.award_status !== "issued") return { status: query.data.award_status as "superseded" | "revoked" };
  return { status: "valid" as const, recipientName: query.data.recipient_legal_name, programme: query.data.programme_name, cohort: query.data.cohort_name_snapshot, discipleshipRoute: query.data.discipleship_route, skillPathway: query.data.skill_pathway, issueDate: query.data.issued_at, awardNumber: query.data.award_number, awardingInstitution: query.data.awarding_institution };
}
