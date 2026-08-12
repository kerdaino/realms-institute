import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { getLateRegistrationInviteLink, RegistrationAccessError } from "@/lib/registrationControl.server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id, inviteId } = await params;
  if (!isUuid(id) || !isUuid(inviteId)) return NextResponse.json({ message: "Invite not found." }, { status: 404 });
  try {
    return NextResponse.json({ inviteUrl: await getLateRegistrationInviteLink(inviteId, id) });
  } catch (error) {
    if (error instanceof RegistrationAccessError) return NextResponse.json({ message: error.message }, { status: error.status });
    console.error("Late registration invite link retrieval failed", error);
    return NextResponse.json({ message: "Invite link is unavailable." }, { status: 500 });
  }
}
