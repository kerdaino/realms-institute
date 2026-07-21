"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { recordStudentMeaningfulActivity } from "@/lib/lms/engagementService";
import { getCurrentUserRoles, resolvePortalRouteForCurrentUser } from "@/lib/lms/auth";
import { normalizePortalLinkIntent, normalizePortalSetupContext } from "@/lib/lms/portalAuthPolicy";
import { issuePasswordSetupGrant } from "@/lib/lms/passwordSetupGrant";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const allowedTypes = new Set<EmailOtpType>(["magiclink", "invite", "email", "recovery"]);

export async function confirmPortalAuth(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") || "").trim();
  const suppliedType = String(formData.get("type") || "").trim() as EmailOtpType;
  const intent = normalizePortalLinkIntent(formData.get("intent"));
  const context = normalizePortalSetupContext(formData.get("context"));
  if (!tokenHash || !allowedTypes.has(suppliedType)) redirect("/portal/login?error=invalid_link");

  const supabase = await createSupabaseServerClient();
  const verified = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: suppliedType });
  if (verified.error || !verified.data.user) {
    console.error("Portal auth confirmation failed", { code: verified.error?.code, status: verified.error?.status });
    redirect("/portal/login?error=invalid_link");
  }

  if (intent === "setup") {
    await issuePasswordSetupGrant(verified.data.user.id, context);
    redirect("/auth/setup-password");
  }

  const admin = getSupabaseAdmin();
  if (admin) await recordStudentMeaningfulActivity(admin, verified.data.user.id);
  redirect(await resolvePortalRouteForCurrentUser(await getCurrentUserRoles()));
}
