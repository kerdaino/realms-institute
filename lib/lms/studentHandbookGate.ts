import "server-only";

import { redirect } from "next/navigation";

import { getStudentHandbookState } from "@/lib/lms/studentHandbook";

export async function requireStudentHandbookAcknowledgement(profileId: string) {
  const state = await getStudentHandbookState(profileId);
  if (state.requiredDocument && !state.acknowledged) redirect("/student/onboarding/handbook");
  return state;
}
