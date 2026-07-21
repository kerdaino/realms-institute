import type { ReactNode } from "react";

import { requireRole } from "@/lib/lms/auth";
import { requireStudentHandbookAcknowledgement } from "@/lib/lms/studentHandbookGate";

export default async function StudentAcademicLayout({ children }: { children: ReactNode }) {
  const { user } = await requireRole("student");
  await requireStudentHandbookAcknowledgement(user.id);
  return children;
}
