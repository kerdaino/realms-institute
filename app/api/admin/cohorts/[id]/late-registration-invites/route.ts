import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid, readNullableTimestamp, readText } from "@/lib/lms/adminConstants";
import { createLateRegistrationInvite, RegistrationAccessError } from "@/lib/registrationControl.server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const expiresAt = readNullableTimestamp(body?.expiresAt);
  const email = readText(body?.applicantEmail, 320);
  if (!isUuid(id) || !body || !email || !expiresAt) return NextResponse.json({ message: "A valid applicant email and future expiry are required." }, { status: 400 });
  try {
    const result = await createLateRegistrationInvite({ cohortId: id, applicantEmail: email, applicantName: readText(body.applicantName, 300), expiresAt, actor: "REALMS Admin" });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof RegistrationAccessError) return NextResponse.json({ message: error.message }, { status: error.status });
    console.error("Late registration invite creation failed", error);
    return NextResponse.json({ message: "Late registration invitation could not be created." }, { status: 500 });
  }
}
