"use server";

import { redirect } from "next/navigation";

import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { getCurrentUserRoles, resolvePortalRouteForCurrentUser } from "@/lib/lms/auth";
import { validatePortalPassword } from "@/lib/lms/portalAuthPolicy";
import { markPortalPasswordConfigured } from "@/lib/lms/portalIdentity";
import { clearPasswordSetupGrant, readPasswordSetupGrant } from "@/lib/lms/passwordSetupGrant";
import { getStudentHandbookState } from "@/lib/lms/studentHandbook";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type SetupPasswordState = { status: "idle" | "error"; message: string };

export async function setPortalPassword(_state: SetupPasswordState, formData: FormData): Promise<SetupPasswordState> {
  const password = String(formData.get("password") || "");
  const confirmation = String(formData.get("password_confirmation") || "");
  if (password !== confirmation) return { status: "error", message: "Passwords do not match." };
  const validation = validatePortalPassword(password);
  if (!validation.valid) return { status: "error", message: validation.requirements.find((item) => !item.met)?.message || "Choose a stronger password." };

  const supabase = await createSupabaseServerClient();
  const authenticated = await supabase.auth.getUser();
  if (authenticated.error || !authenticated.data.user) return { status: "error", message: "Your secure setup session has expired. Please request a new activation or recovery email." };
  const grant = await readPasswordSetupGrant(authenticated.data.user.id);
  if (!grant) return { status: "error", message: "Your secure setup session has expired. Please request a new activation or recovery email." };

  const updated = await supabase.auth.updateUser({ password });
  if (updated.error || !updated.data.user) return { status: "error", message: "This password could not be accepted. Please confirm all password requirements and try again." };

  const admin = getSupabaseAdmin();
  if (admin) {
    await markPortalPasswordConfigured(admin, updated.data.user);
    await recordLmsAudit(admin, { action: "portal_password_configured", entityType: "profile", entityId: updated.data.user.id, actorUserId: updated.data.user.id, metadata: { setup_context: grant.context } });
  }
  await clearPasswordSetupGrant();

  const roles = await getCurrentUserRoles();
  if (grant.context === "student" && roles.includes("student")) {
    const handbook = await getStudentHandbookState(updated.data.user.id);
    if (handbook.requiredDocument && !handbook.acknowledged) redirect("/student/onboarding/handbook");
    redirect("/student");
  }
  if (grant.context === "facilitator" && roles.includes("facilitator")) redirect("/facilitator");
  redirect(await resolvePortalRouteForCurrentUser(roles));
}
