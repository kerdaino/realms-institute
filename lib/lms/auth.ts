import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { type AppRole, appRoles, type Profile } from "@/lib/lms/types";
import { currentStudentEnrollmentStatuses } from "@/lib/lms/currentEnrollment";
import { isSupabaseAuthConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const rolePriority: readonly AppRole[] = ["admin", "facilitator", "mentor", "student", "alumni"];

export const getCurrentUser = cache(async (): Promise<User | null> => {
  if (!isSupabaseAuthConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
});

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, preferred_name, email, phone, avatar_url, account_status, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.error("Portal profile lookup failed", { code: error.code });
    return null;
  }
  return data as Profile | null;
});

export const getCurrentUserRoles = cache(async (): Promise<AppRole[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);
  if (error) {
    console.error("Portal role lookup failed", { code: error.code });
    return [];
  }

  const resolved = (data ?? []).flatMap((row) => {
    const relation = (row as { roles?: { name?: unknown } | Array<{ name?: unknown }> | null }).roles;
    const name = Array.isArray(relation) ? relation[0]?.name : relation?.name;
    return typeof name === "string" && (appRoles as readonly string[]).includes(name) ? [name as AppRole] : [];
  });
  return [...new Set(resolved)];
});

export async function hasRole(role: AppRole, roles?: readonly AppRole[]) {
  const currentRoles = roles ?? await getCurrentUserRoles();
  return currentRoles.includes(role);
}

export async function requireAuthenticatedUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");
  return user;
}

export async function requireRole(role: AppRole) {
  const user = await requireAuthenticatedUser();
  const roles = await getCurrentUserRoles();
  if (roles.length === 0) redirect("/portal/access-pending");
  if (!roles.includes(role)) redirect("/portal/access-denied");
  return { user, roles };
}

export function portalRouteForRoles(roles: readonly AppRole[]) {
  const role = rolePriority.find((candidate) => roles.includes(candidate));
  if (role === "admin") return "/admin";
  if (role === "facilitator") return "/facilitator";
  if (role === "mentor") return "/mentor";
  if (role === "student") return "/student";
  if (role === "alumni") return "/alumni";
  return "/portal/access-pending";
}

export async function resolvePortalRouteForCurrentUser(roles?: readonly AppRole[]) {
  const currentRoles = roles ?? await getCurrentUserRoles();
  if (currentRoles.includes("admin")) return "/admin";
  if (currentRoles.includes("facilitator")) return "/facilitator";
  if (currentRoles.includes("mentor")) return "/mentor";
  if (currentRoles.includes("student")) {
    const user = await getCurrentUser();
    if (user) {
      const supabase = await createSupabaseServerClient();
      const student = await supabase.from("students").select("id").eq("profile_id", user.id).maybeSingle();
      if (student.data) {
        const active = await supabase.from("student_enrollments").select("id", { count: "exact", head: true }).eq("student_id", student.data.id).in("enrolment_status", [...currentStudentEnrollmentStatuses]);
        if ((active.count ?? 0) > 0) return "/student";
      }
    }
  }
  if (currentRoles.includes("alumni")) return "/alumni";
  return portalRouteForRoles(currentRoles);
}
