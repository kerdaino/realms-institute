import "server-only";

import type { GenerateLinkType, SupabaseClient, User } from "@supabase/supabase-js";

import { sendEmail } from "@/lib/email";
import { createFacilitatorPortalActivationEmail, createPortalRecoveryEmail, createPortalSignInLinkEmail, createStudentPortalActivationEmail } from "@/lib/emailTemplates";
import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { currentStudentEnrollmentStatuses, selectCurrentStudentEnrollment } from "@/lib/lms/currentEnrollment";
import { ensurePortalProfile, ensurePortalRole, findOrCreatePortalAuthUser, findPortalAuthUserByEmail, hasConfiguredPortalPassword, normalizePortalEmail, PortalIdentityError } from "@/lib/lms/portalIdentity";
import type { PortalLinkIntent, PortalSetupContext } from "@/lib/lms/portalAuthPolicy";
import { consumePublicRateLimits } from "@/lib/publicRateLimit.server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const activeCohortStatuses = new Set(["planned", "admissions_open", "admissions_closed", "active"]);
const activeOfferingStatuses = new Set(["planned", "published", "active"]);

export type PortalAccountStatus = "not_provisioned" | "invitation_sent" | "account_active" | "recovery_required";
export type PortalDeliveryOutcome = "activation_email_sent" | "setup_email_sent" | "access_reminder_sent" | "recovery_email_sent";

export type PortalAccessResult =
  | { sent: true; outcome: PortalDeliveryOutcome; message: string; userId: string }
  | { sent: false; outcome: "delivery_failed"; message: string; userId?: string };

export type PortalAccountEvidence = {
  status: PortalAccountStatus;
  label: "Not Provisioned" | "Invitation Sent" | "Account Active" | "Recovery Required";
  lastPortalInvitationAt: string | null;
};

export class PortalAccessError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "PortalAccessError";
  }
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function confirmUrl(properties: { hashed_token: string; verification_type: GenerateLinkType }, intent: PortalLinkIntent, context: PortalSetupContext) {
  const params = new URLSearchParams({
    token_hash: properties.hashed_token,
    type: properties.verification_type,
    intent,
    context,
  });
  return `${siteUrl()}/auth/confirm?${params.toString()}`;
}

async function generateAuthLink(supabase: SupabaseClient, user: User, intent: PortalLinkIntent, context: PortalSetupContext, forceRecovery = false) {
  const type = forceRecovery || (intent === "setup" && user.email_confirmed_at) ? "recovery" as const : "magiclink" as const;
  const generated = await supabase.auth.admin.generateLink({ type, email: user.email || "", options: { redirectTo: `${siteUrl()}/auth/confirm` } });
  if (generated.error || !generated.data.properties.hashed_token) throw new PortalAccessError("A secure portal setup link could not be generated.", 503);
  return confirmUrl(generated.data.properties, intent, context);
}

async function resolveStudentIdentity(supabase: SupabaseClient, studentId: string) {
  const student = await supabase.from("students").select("id, profile_id, student_number, legal_name, preferred_name, email, phone, student_status").eq("id", studentId).maybeSingle();
  if (student.error || !student.data) throw new PortalAccessError("The student account could not be loaded.", 404);
  const enrollment = await selectCurrentStudentEnrollment<{ id: string; cohort_id: string; discipleship_route: string; skill_pathway: string; skill_learning_mode: string | null; enrolment_status: string; cohorts: { id: string; code: string; name: string } | Array<{ id: string; code: string; name: string }> | null }>(supabase, studentId, "id, cohort_id, discipleship_route, skill_pathway, skill_learning_mode, enrolment_status, cohorts(id, code, name)");
  if (enrollment.error || !enrollment.data || !currentStudentEnrollmentStatuses.includes(enrollment.data.enrolment_status as (typeof currentStudentEnrollmentStatuses)[number])) throw new PortalAccessError("An active student enrolment is required before portal access can be issued.", 409);

  let auth: Awaited<ReturnType<typeof findOrCreatePortalAuthUser>>;
  try {
    auth = await findOrCreatePortalAuthUser(supabase, { email: student.data.email, fullName: student.data.legal_name });
    if (student.data.profile_id && student.data.profile_id !== auth.user.id) throw new PortalAccessError("This student is linked to a different institutional Auth identity. Manual review is required.", 409);
    await ensurePortalProfile(supabase, { userId: auth.user.id, email: student.data.email, fullName: student.data.legal_name, phone: student.data.phone });
    await ensurePortalRole(supabase, auth.user.id, "student");
  } catch (error) {
    if (error instanceof PortalIdentityError) throw new PortalAccessError(error.message, error.status);
    throw error;
  }
  if (!student.data.profile_id) {
    const linked = await supabase.from("students").update({ profile_id: auth.user.id, updated_at: new Date().toISOString() }).eq("id", student.data.id).is("profile_id", null);
    if (linked.error) throw new PortalAccessError("The student Auth identity could not be linked.", 409);
  }
  const cohort = Array.isArray(enrollment.data.cohorts) ? enrollment.data.cohorts[0] : enrollment.data.cohorts;
  return { student: student.data, enrollment: enrollment.data, cohort, user: auth.user };
}

async function resolveFacilitatorIdentity(supabase: SupabaseClient, facilitatorId: string) {
  const facilitator = await supabase.from("facilitators").select("id, profile_id, display_name, email, phone, active, facilitator_status").eq("id", facilitatorId).maybeSingle();
  if (facilitator.error || !facilitator.data) throw new PortalAccessError("The facilitator account could not be loaded.", 404);
  if (!facilitator.data.active || facilitator.data.facilitator_status !== "active") throw new PortalAccessError("Only an active facilitator can receive portal access.", 409);
  if (!facilitator.data.email) throw new PortalAccessError("Add an approved facilitator email before issuing portal access.", 409);

  let auth: Awaited<ReturnType<typeof findOrCreatePortalAuthUser>>;
  try {
    auth = await findOrCreatePortalAuthUser(supabase, { email: facilitator.data.email, fullName: facilitator.data.display_name });
    if (facilitator.data.profile_id && facilitator.data.profile_id !== auth.user.id) throw new PortalAccessError("This facilitator is linked to a different institutional Auth identity. Manual review is required.", 409);
    await ensurePortalProfile(supabase, { userId: auth.user.id, email: facilitator.data.email, fullName: facilitator.data.display_name, phone: facilitator.data.phone });
    await ensurePortalRole(supabase, auth.user.id, "facilitator");
  } catch (error) {
    if (error instanceof PortalIdentityError) throw new PortalAccessError(error.message, error.status);
    throw error;
  }
  if (!facilitator.data.profile_id) {
    const linked = await supabase.from("facilitators").update({ profile_id: auth.user.id, updated_at: new Date().toISOString() }).eq("id", facilitator.data.id).is("profile_id", null);
    if (linked.error) throw new PortalAccessError("The facilitator Auth identity could not be linked.", 409);
  }
  return { facilitator: facilitator.data, user: auth.user };
}

async function recordPortalDelivery(supabase: SupabaseClient, input: { context: "student" | "facilitator"; entityId: string; userId: string; outcome: PortalDeliveryOutcome }) {
  await recordLmsAudit(supabase, {
    action: input.context === "student" ? "student_portal_access_sent" : "facilitator_portal_access_sent",
    entityType: input.context,
    entityId: input.entityId,
    actorUserId: null,
    metadata: { channel: "email", delivery_kind: input.outcome, auth_user_id: input.userId },
  });
}

export async function provisionStudentPortalAccess(studentId: string, options: { recovery?: boolean } = {}): Promise<PortalAccessResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new PortalAccessError("Supabase administrative access is not configured.", 503);
  const { student, enrollment, cohort, user } = await resolveStudentIdentity(supabase, studentId);
  const passwordConfigured = hasConfiguredPortalPassword(user);
  const mode = options.recovery ? "setup" : passwordConfigured ? "reminder" : user.email_confirmed_at ? "setup" : "activation";
  const actionUrl = mode === "reminder" ? `${siteUrl()}/portal/login` : await generateAuthLink(supabase, user, "setup", "student", Boolean(options.recovery));
  const template = options.recovery
    ? createPortalRecoveryEmail({ name: student.preferred_name || student.legal_name, actionUrl })
    : createStudentPortalActivationEmail({
      name: student.preferred_name || student.legal_name,
      studentNumber: student.student_number,
      cohortName: cohort?.name || "August 2026 Cohort",
      discipleshipRoute: title(enrollment.discipleship_route),
      skillPathway: title(enrollment.skill_pathway),
      actionUrl,
      mode,
    });
  const sent = await sendEmail({ to: student.email, ...template });
  if (!sent.sent) return { sent: false, outcome: "delivery_failed", message: "Email delivery failed. The account remains safely provisioned and the email can be resent.", userId: user.id };
  const outcome: PortalDeliveryOutcome = options.recovery ? "recovery_email_sent" : mode === "activation" ? "activation_email_sent" : mode === "setup" ? "setup_email_sent" : "access_reminder_sent";
  await recordPortalDelivery(supabase, { context: "student", entityId: student.id, userId: user.id, outcome });
  return { sent: true, outcome, message: portalOutcomeMessage(outcome), userId: user.id };
}

export async function provisionFacilitatorPortalAccess(facilitatorId: string, options: { recovery?: boolean } = {}): Promise<PortalAccessResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new PortalAccessError("Supabase administrative access is not configured.", 503);
  const { facilitator, user } = await resolveFacilitatorIdentity(supabase, facilitatorId);
  const assignmentResult = await supabase.from("facilitator_course_assignments").select("id, cohort_courses(status, courses(code, title), cohorts(code, name, status))").eq("facilitator_id", facilitator.id);
  if (assignmentResult.error) throw new PortalAccessError("The facilitator course assignments could not be loaded.");
  const assignments = (assignmentResult.data ?? []).flatMap((row) => {
    const offering = Array.isArray(row.cohort_courses) ? row.cohort_courses[0] : row.cohort_courses;
    const cohort = Array.isArray(offering?.cohorts) ? offering.cohorts[0] : offering?.cohorts;
    const course = Array.isArray(offering?.courses) ? offering.courses[0] : offering?.courses;
    if (!cohort || !course || !activeCohortStatuses.has(cohort.status) || !activeOfferingStatuses.has(offering.status)) return [];
    return [`${cohort.code} · ${course.code} · ${course.title}`];
  });
  const cohortNames = [...new Set((assignmentResult.data ?? []).flatMap((row) => {
    const offering = Array.isArray(row.cohort_courses) ? row.cohort_courses[0] : row.cohort_courses;
    const cohort = Array.isArray(offering?.cohorts) ? offering.cohorts[0] : offering?.cohorts;
    return cohort && activeCohortStatuses.has(cohort.status) ? [cohort.name] : [];
  }))];
  const passwordConfigured = hasConfiguredPortalPassword(user);
  const mode = options.recovery ? "setup" : passwordConfigured ? "reminder" : user.email_confirmed_at ? "setup" : "activation";
  const actionUrl = mode === "reminder" ? `${siteUrl()}/portal/login` : await generateAuthLink(supabase, user, "setup", "facilitator", Boolean(options.recovery));
  const template = options.recovery
    ? createPortalRecoveryEmail({ name: facilitator.display_name, actionUrl })
    : createFacilitatorPortalActivationEmail({ name: facilitator.display_name, cohortName: cohortNames.join(", ") || "August 2026", assignments, actionUrl, mode });
  const sent = await sendEmail({ to: facilitator.email!, ...template });
  if (!sent.sent) return { sent: false, outcome: "delivery_failed", message: "Email delivery failed. The account remains safely provisioned and the email can be resent.", userId: user.id };
  const outcome: PortalDeliveryOutcome = options.recovery ? "recovery_email_sent" : mode === "activation" ? "activation_email_sent" : mode === "setup" ? "setup_email_sent" : "access_reminder_sent";
  await recordPortalDelivery(supabase, { context: "facilitator", entityId: facilitator.id, userId: user.id, outcome });
  return { sent: true, outcome, message: portalOutcomeMessage(outcome), userId: user.id };
}

export async function requestPortalRecovery(email: string, source: string) {
  const limit = await consumePublicRateLimits([
    { policy: "forgot_password_source", identifier: source },
    { policy: "forgot_password_email", identifier: normalizePortalEmail(email) },
  ]);
  // Public auth-email actions fail closed but remain deliberately silent so
  // callers cannot distinguish a missing account from a throttled request.
  if (limit.status !== "allowed") return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  try {
    const user = await findPortalAuthUserByEmail(supabase, email);
    if (!user?.email) return;
    const actionUrl = await generateAuthLink(supabase, user, "setup", "recovery", true);
    const profile = await supabase.from("profiles").select("preferred_name, full_name").eq("id", user.id).maybeSingle();
    const template = createPortalRecoveryEmail({ name: profile.data?.preferred_name || profile.data?.full_name || "REALMS Portal User", actionUrl });
    await sendEmail({ to: user.email, ...template });
  } catch (error) {
    console.error("Portal recovery request could not be completed", { name: error instanceof Error ? error.name : "UnknownError" });
  }
}

export async function requestPortalSignInLink(email: string, source: string) {
  const limit = await consumePublicRateLimits([
    { policy: "magic_link_source", identifier: source },
    { policy: "magic_link_email", identifier: normalizePortalEmail(email) },
  ]);
  if (limit.status !== "allowed") return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  try {
    const user = await findPortalAuthUserByEmail(supabase, email);
    if (!user?.email) return;
    const actionUrl = await generateAuthLink(supabase, user, "signin", "recovery");
    const profile = await supabase.from("profiles").select("preferred_name, full_name").eq("id", user.id).maybeSingle();
    const template = createPortalSignInLinkEmail({ name: profile.data?.preferred_name || profile.data?.full_name || "REALMS Portal User", actionUrl });
    await sendEmail({ to: user.email, ...template });
  } catch (error) {
    console.error("Portal sign-in link request could not be completed", { name: error instanceof Error ? error.name : "UnknownError" });
  }
}

export async function fetchPortalAccountEvidence(supabase: SupabaseClient, input: { profileId: string | null; entityType: "student" | "facilitator"; entityId: string }): Promise<PortalAccountEvidence> {
  if (!input.profileId) return { status: "not_provisioned", label: "Not Provisioned", lastPortalInvitationAt: null };
  const [auth, audit] = await Promise.all([
    supabase.auth.admin.getUserById(input.profileId),
    supabase.from("audit_logs").select("created_at, metadata").eq("entity_type", input.entityType).eq("entity_id", input.entityId).in("action", ["student_portal_access_sent", "facilitator_portal_access_sent"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (auth.error || !auth.data.user) return { status: "not_provisioned", label: "Not Provisioned", lastPortalInvitationAt: audit.data?.created_at ?? null };
  if (hasConfiguredPortalPassword(auth.data.user)) return { status: "account_active", label: "Account Active", lastPortalInvitationAt: audit.data?.created_at ?? null };
  if (audit.data) return { status: "invitation_sent", label: "Invitation Sent", lastPortalInvitationAt: audit.data.created_at };
  return { status: "recovery_required", label: "Recovery Required", lastPortalInvitationAt: null };
}

export function portalOutcomeMessage(outcome: PortalDeliveryOutcome) {
  if (outcome === "activation_email_sent") return "Activation email sent.";
  if (outcome === "setup_email_sent") return "Recovery/setup email sent.";
  if (outcome === "recovery_email_sent") return "Password reset / account recovery email sent.";
  return "Account already active. Portal access reminder sent.";
}
