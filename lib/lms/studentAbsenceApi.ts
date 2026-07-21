import "server-only";

import { getCurrentUser, getCurrentUserRoles } from "@/lib/lms/auth";
import { LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";
import { assertStudentHandbookAcknowledged } from "@/lib/lms/studentHandbook";

export async function requireStudentAbsenceApi() {
  const user = await getCurrentUser(); if (!user) throw new LmsAdminDataError("Please sign in to manage absence requests.", 401);
  if (!(await getCurrentUserRoles()).includes("student")) throw new LmsAdminDataError("Student access required.", 403);
  const supabase = requireLmsAdminClient(); await assertStudentHandbookAcknowledged(user.id, supabase);
  return { user, supabase };
}
