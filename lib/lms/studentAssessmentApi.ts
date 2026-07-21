import "server-only";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
import { getCurrentUser, getCurrentUserRoles } from "@/lib/lms/auth";
export async function resolveStudentAssessmentApiContext() { const user = await getCurrentUser(); if (!user) throw new LmsAdminDataError("Authentication required.", 401); const roles = await getCurrentUserRoles(); if (!roles.includes("student")) throw new LmsAdminDataError("Student access required.", 403); return { user, supabase: requireLmsAdminClient() }; }
