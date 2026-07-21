import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { getCurrentUserRoles, resolvePortalRouteForCurrentUser } from "@/lib/lms/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { recordStudentMeaningfulActivity } from "@/lib/lms/engagementService";

const allowedTypes = new Set<EmailOtpType>(["magiclink", "invite", "email"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash")?.trim();
  const suppliedType = url.searchParams.get("type")?.trim() as EmailOtpType | undefined;
  if (!tokenHash || !suppliedType || !allowedTypes.has(suppliedType)) return NextResponse.redirect(new URL("/portal/login?error=invalid_link", url));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: suppliedType });
  if (error) {
    console.error("Portal invite confirmation failed", { code: error.code, status: error.status });
    return NextResponse.redirect(new URL("/portal/login?error=invalid_link", url));
  }

  const authenticated = await supabase.auth.getUser();
  const admin = getSupabaseAdmin();
  if (admin && authenticated.data.user) await recordStudentMeaningfulActivity(admin, authenticated.data.user.id);

  const response = NextResponse.redirect(new URL(await resolvePortalRouteForCurrentUser(await getCurrentUserRoles()), url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
