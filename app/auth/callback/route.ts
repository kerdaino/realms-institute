import { NextResponse } from "next/server";

import { getCurrentUserRoles, resolvePortalRouteForCurrentUser } from "@/lib/lms/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordStudentMeaningfulActivity } from "@/lib/lms/engagementService";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePortalLinkIntent, normalizePortalSetupContext } from "@/lib/lms/portalAuthPolicy";
import { issuePasswordSetupGrant } from "@/lib/lms/passwordSetupGrant";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();
  const intent = normalizePortalLinkIntent(url.searchParams.get("intent"));
  const context = normalizePortalSetupContext(url.searchParams.get("context"));
  if (!code) return NextResponse.redirect(new URL("/portal/login?error=invalid_link", url));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("Portal auth callback failed", { code: error.code, status: error.status });
    return NextResponse.redirect(new URL("/portal/login?error=invalid_link", url));
  }

  const authenticated = await supabase.auth.getUser();
  if (intent === "setup" && authenticated.data.user) {
    await issuePasswordSetupGrant(authenticated.data.user.id, context);
    const setupResponse = NextResponse.redirect(new URL("/auth/setup-password", url));
    setupResponse.headers.set("Cache-Control", "private, no-store");
    return setupResponse;
  }
  const admin = getSupabaseAdmin();
  if (admin && authenticated.data.user) await recordStudentMeaningfulActivity(admin, authenticated.data.user.id);

  const response = NextResponse.redirect(new URL(await resolvePortalRouteForCurrentUser(await getCurrentUserRoles()), url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
