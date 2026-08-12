import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid, readNullableTimestamp } from "@/lib/lms/adminConstants";
import { registrationStatuses } from "@/lib/registrationControl";
import { RegistrationAccessError, updateCohortRegistrationControl } from "@/lib/registrationControl.server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!isUuid(id) || !body || typeof body.registrationStatus !== "string" || !(registrationStatuses as readonly string[]).includes(body.registrationStatus)) {
    return NextResponse.json({ message: "A valid cohort and registration status are required." }, { status: 400 });
  }
  const opensAt = readNullableTimestamp(body.registrationOpensAt);
  const closesAt = readNullableTimestamp(body.registrationClosesAt);
  if (opensAt === undefined || closesAt === undefined) return NextResponse.json({ message: "Enter valid optional registration opening and closing times." }, { status: 400 });
  try {
    const cohort = await updateCohortRegistrationControl({
      cohortId: id,
      registrationStatus: body.registrationStatus as "open" | "closed",
      registrationOpensAt: opensAt,
      registrationClosesAt: closesAt,
      makePublicRegistrationCohort: body.makePublicRegistrationCohort === true,
      actor: "REALMS Admin",
    });
    return NextResponse.json({ cohort });
  } catch (error) {
    if (error instanceof RegistrationAccessError) return NextResponse.json({ message: error.message }, { status: error.status });
    console.error("Cohort registration control update failed", error);
    return NextResponse.json({ message: "Registration control could not be updated." }, { status: 500 });
  }
}
