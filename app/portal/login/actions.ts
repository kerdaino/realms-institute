"use server";

import { redirect } from "next/navigation";

import { getCurrentUserRoles, resolvePortalRouteForCurrentUser } from "@/lib/lms/auth";
import { markPortalPasswordConfigured } from "@/lib/lms/portalIdentity";
import { requestPortalRecovery, requestPortalSignInLink } from "@/lib/lms/portalInvite";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAuthConfigured } from "@/lib/supabase/config";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type PortalLoginState = {
  status: "idle" | "success" | "error";
  message: string;
};

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function requestPortalMagicLink(_state: PortalLoginState, formData: FormData): Promise<PortalLoginState> {
  const email = String(formData.get("email") || "").trim().toLowerCase().slice(0, 320);
  if (!isEmail(email)) return { status: "error", message: "Enter a valid email address." };
  if (!isSupabaseAuthConfigured()) return { status: "error", message: "Portal authentication is not configured yet. Please contact REALMS Institute." };

  await requestPortalSignInLink(email);

  // Keep this response deliberately generic so the login form cannot be used
  // to discover which email addresses have institutional accounts.
  return {
    status: "success",
    message: "If an activated institutional account exists for this email, a secure sign-in link has been sent. Please check your inbox.",
  };
}

export async function signInWithPortalPassword(_state: PortalLoginState, formData: FormData): Promise<PortalLoginState> {
  const email = String(formData.get("email") || "").trim().toLowerCase().slice(0, 320);
  const password = String(formData.get("password") || "");
  if (!isEmail(email) || !password) return { status: "error", message: "Enter your email address and password." };
  if (!isSupabaseAuthConfigured()) return { status: "error", message: "Portal authentication is not configured yet. Please contact REALMS Institute." };

  const supabase = await createSupabaseServerClient();
  const authenticated = await supabase.auth.signInWithPassword({ email, password });
  if (authenticated.error || !authenticated.data.user) {
    return { status: "error", message: "The email address or password is incorrect." };
  }
  const admin = getSupabaseAdmin();
  if (admin) await markPortalPasswordConfigured(admin, authenticated.data.user);
  redirect(await resolvePortalRouteForCurrentUser(await getCurrentUserRoles()));
}

export async function requestPortalPasswordRecovery(_state: PortalLoginState, formData: FormData): Promise<PortalLoginState> {
  const email = String(formData.get("email") || "").trim().toLowerCase().slice(0, 320);
  if (!isEmail(email)) return { status: "error", message: "Enter a valid email address." };
  await requestPortalRecovery(email);
  return { status: "success", message: "If an account exists for this email, recovery instructions have been sent." };
}
