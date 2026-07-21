import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

export class PortalIdentityError extends Error {
  constructor(message: string, public readonly status = 500) {
    super(message);
    this.name = "PortalIdentityError";
  }
}

export function normalizePortalEmail(value: string) {
  return value.trim().toLowerCase();
}

export function hasConfiguredPortalPassword(user: User) {
  return typeof user.app_metadata?.realms_password_configured_at === "string";
}

export async function findPortalAuthUserByEmail(supabase: SupabaseClient, email: string): Promise<User | null> {
  const normalized = normalizePortalEmail(email);
  const perPage = 200;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new PortalIdentityError("The institutional Auth directory could not be checked.", 503);
    const user = data.users.find((candidate) => normalizePortalEmail(candidate.email || "") === normalized);
    if (user) return user;
    if (data.users.length < perPage) return null;
  }
  throw new PortalIdentityError("The institutional Auth directory is too large to search safely.", 503);
}

export async function findOrCreatePortalAuthUser(supabase: SupabaseClient, input: { email: string; fullName: string }) {
  const email = normalizePortalEmail(input.email);
  const existing = await findPortalAuthUserByEmail(supabase, email);
  if (existing) return { user: existing, status: "existing" as const };

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: { full_name: input.fullName },
  });
  if (!error && data.user) return { user: data.user, status: "created" as const };

  const racedUser = await findPortalAuthUserByEmail(supabase, email);
  if (racedUser) return { user: racedUser, status: "existing" as const };
  throw new PortalIdentityError("The institutional Auth account could not be prepared.", 503);
}

export async function ensurePortalProfile(supabase: SupabaseClient, input: { userId: string; email: string; fullName: string; phone?: string | null }) {
  const existing = await supabase.from("profiles").select("id, full_name, preferred_name, email, phone, account_status").eq("id", input.userId).maybeSingle();
  if (existing.error) throw new PortalIdentityError("The institutional profile could not be checked.");
  const { error } = await supabase.from("profiles").upsert({
    id: input.userId,
    full_name: existing.data?.full_name || input.fullName,
    preferred_name: existing.data?.preferred_name ?? null,
    email: normalizePortalEmail(input.email),
    phone: existing.data?.phone || input.phone || null,
    account_status: existing.data?.account_status || "active",
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw new PortalIdentityError("The institutional profile could not be saved.");
  return existing.data ? "updated" as const : "created" as const;
}

export async function ensurePortalRole(supabase: SupabaseClient, userId: string, roleName: "student" | "facilitator") {
  const role = await supabase.from("roles").select("id").eq("name", roleName).maybeSingle();
  if (role.error || !role.data) throw new PortalIdentityError(`The ${roleName} role is not configured.`);
  const assigned = await supabase.from("user_roles").upsert({ user_id: userId, role_id: role.data.id }, { onConflict: "user_id,role_id", ignoreDuplicates: true });
  if (assigned.error) throw new PortalIdentityError(`The ${roleName} role could not be assigned.`);
}

export async function markPortalPasswordConfigured(supabase: SupabaseClient, user: User) {
  if (hasConfiguredPortalPassword(user)) return false;
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, realms_password_configured_at: new Date().toISOString() },
  });
  if (error) {
    console.error("Portal password status update failed", { code: error.code, status: error.status });
    return false;
  }
  return true;
}
