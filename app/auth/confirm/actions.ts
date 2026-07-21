"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { recordStudentMeaningfulActivity } from "@/lib/lms/engagementService";
import { getCurrentUserRoles, resolvePortalRouteForCurrentUser } from "@/lib/lms/auth";
import { isPortalLinkIntent, isPortalSetupContext } from "@/lib/lms/portalAuthPolicy";
import { issuePasswordSetupGrant } from "@/lib/lms/passwordSetupGrant";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const allowedTypes = new Set<EmailOtpType>(["magiclink", "invite", "email", "recovery"]);
const invalidCredentialCodes = new Set(["invalid_credentials", "invite_not_found", "otp_disabled", "otp_expired", "user_not_found"]);
const invalidLinkPath = "/auth/confirm?error=invalid_link";
const temporaryFailureMessage = "We could not complete secure verification right now. Please try again shortly or contact REALMS Institute for support.";

export type ConfirmPortalAuthState = { status: "idle" | "error"; message: string };

function isInvalidCredentialError(error: { code?: string } | null) {
  return Boolean(error?.code && invalidCredentialCodes.has(error.code));
}

export async function confirmPortalAuth(_state: ConfirmPortalAuthState, formData: FormData): Promise<ConfirmPortalAuthState> {
  const tokenHash = String(formData.get("token_hash") || "").trim();
  const suppliedType = String(formData.get("type") || "").trim() as EmailOtpType;
  const suppliedIntent = String(formData.get("intent") || "signin").trim();
  const suppliedContext = String(formData.get("context") || "recovery").trim();
  if (!tokenHash || !allowedTypes.has(suppliedType) || !isPortalLinkIntent(suppliedIntent) || !isPortalSetupContext(suppliedContext)) redirect(invalidLinkPath);

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("Portal auth confirmation could not start", { name: error instanceof Error ? error.name : "UnknownError" });
    return { status: "error", message: temporaryFailureMessage };
  }

  const verified = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: suppliedType });
  if (verified.error || !verified.data.user) {
    console.error("Portal auth confirmation failed", { code: verified.error?.code, status: verified.error?.status });
    if (isInvalidCredentialError(verified.error)) redirect(invalidLinkPath);
    return { status: "error", message: temporaryFailureMessage };
  }

  const authenticated = await supabase.auth.getUser();
  if (authenticated.error || !authenticated.data.user || authenticated.data.user.id !== verified.data.user.id) {
    console.error("Portal auth confirmation did not establish a trusted session", { code: authenticated.error?.code, status: authenticated.error?.status });
    return { status: "error", message: temporaryFailureMessage };
  }

  if (suppliedIntent === "setup") {
    try {
      await issuePasswordSetupGrant(authenticated.data.user.id, suppliedContext);
    } catch (error) {
      console.error("Portal password setup grant could not be issued", { name: error instanceof Error ? error.name : "UnknownError" });
      return { status: "error", message: temporaryFailureMessage };
    }
    redirect("/auth/setup-password");
  }

  const admin = getSupabaseAdmin();
  if (admin) await recordStudentMeaningfulActivity(admin, authenticated.data.user.id);
  redirect(await resolvePortalRouteForCurrentUser(await getCurrentUserRoles()));
}
