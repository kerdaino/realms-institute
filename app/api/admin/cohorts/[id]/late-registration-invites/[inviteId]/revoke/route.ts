import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { RegistrationAccessError, revokeLateRegistrationInvite } from "@/lib/registrationControl.server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id, inviteId } = await params;
  if (!isUuid(id) || !isUuid(inviteId)) return NextResponse.json({ message: "Invite not found." }, { status: 404 });
  try {
    await revokeLateRegistrationInvite(inviteId, id, "REALMS Admin");
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RegistrationAccessError) return NextResponse.json({ message: error.message }, { status: error.status });
    console.error("Late registration invite revocation failed", error);
    return NextResponse.json({ message: "Invitation could not be revoked." }, { status: 500 });
  }
}
