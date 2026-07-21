"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAuthConfigured } from "@/lib/supabase/config";

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

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    console.error("Portal magic-link request failed", { code: error.code, status: error.status });
  }

  // Keep this response deliberately generic so the login form cannot be used
  // to discover which email addresses have institutional accounts.
  return {
    status: "success",
    message: "If an activated institutional account exists for this email, a secure access link has been sent. Please check your inbox.",
  };
}
