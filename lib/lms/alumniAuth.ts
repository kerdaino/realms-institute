import "server-only";

import { LmsAdminDataError } from "@/lib/lms/adminData";
import { getCurrentUser, getCurrentUserRoles } from "@/lib/lms/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireAlumniApi() { const user = await getCurrentUser(); if (!user) throw new LmsAdminDataError("Authentication is required.", 401); const roles = await getCurrentUserRoles(); if (!roles.includes("alumni")) throw new LmsAdminDataError("Alumni access is required.", 403); return { user, supabase: await createSupabaseServerClient() }; }
