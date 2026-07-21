import "server-only";

import { getCurrentUser, getCurrentUserRoles } from "@/lib/lms/auth";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";

export async function requireStudentAbsenceApi() {
  const user = await getCurrentUser(); if (!user) throw new LmsAdminDataError("Please sign in to manage absence requests.", 401);
  if (!(await getCurrentUserRoles()).includes("student")) throw new LmsAdminDataError("Student access required.", 403);
  return { user, supabase: requireLmsAdminClient() };
}
