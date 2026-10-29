import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { activateProgrammeEnrollment, lifecycleReconciliationReason, ProgrammeEnrollmentLifecycleError } from "@/lib/lms/programmeEnrollmentLifecycle";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ message: "Programme enrolment not found." }, { status: 404 });
  try {
    const enrollment = await activateProgrammeEnrollment(requireLmsAdminClient(), id, lifecycleReconciliationReason);
    return NextResponse.json({ enrollment });
  } catch (error) {
    const status = error instanceof ProgrammeEnrollmentLifecycleError ? error.status : 500;
    return NextResponse.json({ message: error instanceof Error ? error.message : "Programme enrolment could not be activated." }, { status });
  }
}
