import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordLmsAudit } from "@/lib/lms/adminAudit";
import {
  lateRegistrationInviteStatus,
  normalizeInviteEmail,
  registrationAvailability,
  registrationClosedMessage,
  type RegistrationCohort,
  type RegistrationStatus,
  validRegistrationWindow,
} from "@/lib/registrationControl";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const publicCohortSelect = "id, code, name, registration_status, registration_opens_at, registration_closes_at, is_public_registration_cohort";
const inviteSelect = "id, cohort_id, applicant_email, applicant_name, expires_at, revoked_at, consumed_at, consumed_registration_id, created_at, created_by, revoked_by, cohorts(id, code, name, registration_status, registration_opens_at, registration_closes_at, is_public_registration_cohort)";

type InviteRow = {
  id: string;
  cohort_id: string;
  applicant_email: string;
  applicant_name: string | null;
  expires_at: string;
  revoked_at: string | null;
  consumed_at: string | null;
  consumed_registration_id: string | null;
  created_at: string;
  created_by: string;
  revoked_by: string | null;
  cohorts: RegistrationCohort | RegistrationCohort[];
};

export type RegistrationAuthorization = {
  cohort: RegistrationCohort;
  inviteId: string | null;
};

export type PublicRegistrationState =
  | { kind: "open"; cohort: RegistrationCohort }
  | { kind: "closed"; cohort: RegistrationCohort | null; reason: string };

export type LateRegistrationPageState =
  | { kind: "valid"; cohort: RegistrationCohort; inviteId: string; applicantEmail: string; applicantName: string | null }
  | { kind: "invalid"; message: string };

export class RegistrationAccessError extends Error {
  constructor(message = registrationClosedMessage, public readonly status = 403) {
    super(message);
    this.name = "RegistrationAccessError";
  }
}

function requireClient() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new RegistrationAccessError("Registration is temporarily unavailable. Please contact REALMS Admissions.", 503);
  return supabase;
}

function relation<T>(value: T | T[]) {
  return Array.isArray(value) ? value[0] : value;
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(`realms-late-registration:${token}`).digest("hex");
}

function inviteEncryptionKey() {
  const secret = process.env.LATE_REGISTRATION_INVITE_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("Late registration invitations are not configured.");
  return createHash("sha256").update(`realms-late-registration-encryption:${secret}`).digest();
}

function encryptInviteToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", inviteEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), ciphertext.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

function decryptInviteToken(value: string) {
  const [version, iv, ciphertext, tag, extra] = value.split(".");
  if (version !== "v1" || !iv || !ciphertext || !tag || extra) throw new Error("LATE_REGISTRATION_INVITE_TOKEN_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", inviteEncryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function getPublicRegistrationState(now = new Date()): Promise<PublicRegistrationState> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { kind: "closed", cohort: null, reason: "Registration availability is temporarily unavailable." };
  const result = await supabase.from("cohorts").select(publicCohortSelect).eq("is_public_registration_cohort", true).limit(2);
  if (result.error) {
    console.error("Public registration cohort lookup failed", { code: result.error.code });
    return { kind: "closed", cohort: null, reason: "Registration availability is temporarily unavailable." };
  }
  if ((result.data ?? []).length !== 1) {
    if ((result.data ?? []).length > 1) console.error("Multiple public registration cohorts were returned despite the database invariant.");
    return { kind: "closed", cohort: null, reason: "No public registration cohort is currently available." };
  }
  const cohort = result.data![0] as RegistrationCohort;
  const availability = registrationAvailability(cohort, now);
  return availability.isOpen ? { kind: "open", cohort } : { kind: "closed", cohort, reason: registrationClosedMessage };
}

async function resolveInviteRow(token: string) {
  if (!token || token.length > 512) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const result = await supabase.from("late_registration_invites").select(inviteSelect).eq("token_hash", hashInviteToken(token)).maybeSingle();
  if (result.error) {
    console.error("Late registration invite lookup failed", { code: result.error.code });
    return null;
  }
  return result.data as InviteRow | null;
}

export async function getLateRegistrationPageState(token: string, now = new Date()): Promise<LateRegistrationPageState> {
  const invite = await resolveInviteRow(token);
  if (!invite || lateRegistrationInviteStatus(invite, now) !== "active") {
    return { kind: "invalid", message: "This private registration invitation is invalid, expired, revoked, or has already been used. Please contact REALMS Admissions." };
  }
  const cohort = relation(invite.cohorts);
  if (!cohort) return { kind: "invalid", message: "The cohort for this private registration invitation is unavailable." };
  return { kind: "valid", cohort, inviteId: invite.id, applicantEmail: invite.applicant_email, applicantName: invite.applicant_name };
}

export async function authorizeRegistrationRequest(input: {
  cohortId: string;
  applicantEmail: string;
  inviteToken?: string | null;
  now?: Date;
}): Promise<RegistrationAuthorization> {
  if (!validUuid(input.cohortId)) throw new RegistrationAccessError();
  const now = input.now ?? new Date();
  if (input.inviteToken) {
    const invite = await resolveInviteRow(input.inviteToken);
    const cohort = invite ? relation(invite.cohorts) : null;
    if (!invite || !cohort || invite.cohort_id !== input.cohortId || lateRegistrationInviteStatus(invite, now) !== "active") {
      throw new RegistrationAccessError("This private registration invitation is invalid, expired, revoked, or has already been used.");
    }
    if (normalizeInviteEmail(invite.applicant_email) !== normalizeInviteEmail(input.applicantEmail)) {
      throw new RegistrationAccessError("Please use the email address authorised for this private registration invitation.");
    }
    return { cohort, inviteId: invite.id };
  }

  const state = await getPublicRegistrationState(now);
  if (state.kind !== "open" || state.cohort.id !== input.cohortId) throw new RegistrationAccessError();
  return { cohort: state.cohort, inviteId: null };
}

function inviteUrl(token: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!base) throw new Error("The REALMS site URL is not configured.");
  return new URL(`/register/invite/${encodeURIComponent(token)}`, base).toString();
}

export async function createLateRegistrationInvite(input: {
  cohortId: string;
  applicantEmail: string;
  applicantName: string | null;
  expiresAt: string;
  actor: string;
}) {
  if (!validUuid(input.cohortId) || !validEmail(input.applicantEmail) || Date.parse(input.expiresAt) <= Date.now()) {
    throw new RegistrationAccessError("A valid cohort, applicant email, and future expiry are required.", 400);
  }
  const supabase = requireClient();
  const token = randomBytes(32).toString("base64url");
  const created = await supabase.from("late_registration_invites").insert({
    cohort_id: input.cohortId,
    applicant_email: normalizeInviteEmail(input.applicantEmail),
    applicant_name: input.applicantName?.trim().slice(0, 300) || null,
    token_hash: hashInviteToken(token),
    token_ciphertext: encryptInviteToken(token),
    expires_at: new Date(input.expiresAt).toISOString(),
    created_by: input.actor,
  }).select(inviteSelect).single();
  if (created.error || !created.data) throw new Error(`LATE_REGISTRATION_INVITE_CREATE_FAILED:${created.error?.message || "No invite returned."}`);
  await recordLmsAudit(supabase, { action: "late_registration_invite_created", entityType: "cohort", entityId: input.cohortId, metadata: { invite_id: created.data.id, applicant_email: normalizeInviteEmail(input.applicantEmail), expires_at: input.expiresAt, actor: input.actor } });
  return { invite: safeInvite(created.data as InviteRow), inviteUrl: inviteUrl(token) };
}

export async function listLateRegistrationInvites(supabase: SupabaseClient, cohortId: string) {
  const result = await supabase.from("late_registration_invites").select(inviteSelect).eq("cohort_id", cohortId).order("created_at", { ascending: false }).limit(250);
  if (result.error) throw new Error(`LATE_REGISTRATION_INVITES_LOAD_FAILED:${result.error.message}`);
  return (result.data ?? []).map((row) => safeInvite(row as InviteRow));
}

export async function getLateRegistrationInviteLink(inviteId: string, cohortId: string) {
  if (!validUuid(inviteId) || !validUuid(cohortId)) throw new RegistrationAccessError("Invite not found.", 404);
  const supabase = requireClient();
  const result = await supabase.from("late_registration_invites").select("id, cohort_id, token_ciphertext").eq("id", inviteId).eq("cohort_id", cohortId).maybeSingle();
  if (result.error || !result.data?.token_ciphertext) throw new RegistrationAccessError("Invite link is unavailable.", 404);
  return inviteUrl(decryptInviteToken(String(result.data.token_ciphertext)));
}

function safeInvite(invite: InviteRow) {
  return {
    id: invite.id,
    cohort_id: invite.cohort_id,
    applicant_email: invite.applicant_email,
    applicant_name: invite.applicant_name,
    expires_at: invite.expires_at,
    revoked_at: invite.revoked_at,
    consumed_at: invite.consumed_at,
    consumed_registration_id: invite.consumed_registration_id,
    created_at: invite.created_at,
    created_by: invite.created_by,
    revoked_by: invite.revoked_by,
    status: lateRegistrationInviteStatus(invite),
  };
}

export async function revokeLateRegistrationInvite(inviteId: string, cohortId: string, actor: string) {
  if (!validUuid(inviteId)) throw new RegistrationAccessError("Invite not found.", 404);
  const supabase = requireClient();
  const current = await supabase.from("late_registration_invites").select("id, cohort_id, revoked_at, consumed_at").eq("id", inviteId).eq("cohort_id", cohortId).maybeSingle();
  if (current.error || !current.data) throw new RegistrationAccessError("Invite not found.", 404);
  if (current.data.consumed_at) throw new RegistrationAccessError("A used invitation cannot be revoked.", 409);
  if (!current.data.revoked_at) {
    const revokedAt = new Date().toISOString();
    const saved = await supabase.from("late_registration_invites").update({ revoked_at: revokedAt, revoked_by: actor }).eq("id", inviteId).is("revoked_at", null).is("consumed_at", null).select("id").maybeSingle();
    if (saved.error || !saved.data) throw new RegistrationAccessError("Invite state changed. Refresh and try again.", 409);
    await recordLmsAudit(supabase, { action: "late_registration_invite_revoked", entityType: "cohort", entityId: current.data.cohort_id, metadata: { invite_id: inviteId, actor, revoked_at: revokedAt } });
  }
}

export async function updateCohortRegistrationControl(input: {
  cohortId: string;
  registrationStatus: RegistrationStatus;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  makePublicRegistrationCohort: boolean;
  actor: string;
}) {
  if (!validUuid(input.cohortId) || !validRegistrationWindow(input.registrationOpensAt, input.registrationClosesAt)) {
    throw new RegistrationAccessError("A valid cohort and registration window are required.", 400);
  }
  const supabase = requireClient();
  const current = await supabase.from("cohorts").select(publicCohortSelect).eq("id", input.cohortId).maybeSingle();
  if (current.error || !current.data) throw new RegistrationAccessError("Cohort not found.", 404);
  const previous = current.data as RegistrationCohort;

  if (input.makePublicRegistrationCohort && !previous.is_public_registration_cohort) {
    const former = await supabase.from("cohorts").select("id, code, name").eq("is_public_registration_cohort", true).limit(1).maybeSingle();
    if (former.error) throw new Error(`PUBLIC_REGISTRATION_COHORT_LOOKUP_FAILED:${former.error.message}`);
    const switched = await supabase.rpc("set_public_registration_cohort", { target_cohort_id: input.cohortId });
    if (switched.error) throw new Error(`PUBLIC_REGISTRATION_COHORT_CHANGE_FAILED:${switched.error.message}`);
    await recordLmsAudit(supabase, { action: "public_registration_cohort_changed", entityType: "cohort", entityId: input.cohortId, metadata: { previous_cohort_id: former.data?.id ?? null, previous_cohort_code: former.data?.code ?? null, cohort_code: previous.code, public_registration_cohort: true, actor: input.actor } });
  }

  const updatedAt = new Date().toISOString();
  const saved = await supabase.from("cohorts").update({
    registration_status: input.registrationStatus,
    registration_opens_at: input.registrationOpensAt,
    registration_closes_at: input.registrationClosesAt,
    updated_at: updatedAt,
  }).eq("id", input.cohortId).select(publicCohortSelect).single();
  if (saved.error || !saved.data) throw new Error(`REGISTRATION_CONTROL_UPDATE_FAILED:${saved.error?.message || "No cohort returned."}`);
  if (previous.registration_status !== input.registrationStatus) {
    await recordLmsAudit(supabase, {
      action: input.registrationStatus === "open" ? "registration_opened" : "registration_closed",
      entityType: "cohort",
      entityId: input.cohortId,
      metadata: { cohort_code: previous.code, previous_status: previous.registration_status, registration_status: input.registrationStatus, actor: input.actor, changed_at: updatedAt },
    });
  }
  return saved.data as RegistrationCohort;
}
