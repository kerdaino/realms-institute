import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { sendStudentPortalInvite } from "@/lib/lms/portalInvite";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ message: "Student not found." }, { status: 404 });
  const result = await sendStudentPortalInvite(id);
  if (!result.sent) return NextResponse.json({ message: result.reason || "Portal access could not be sent." }, { status: 502 });
  await recordLmsAudit(requireLmsAdminClient(), { action: "student_portal_access_sent", entityType: "student", entityId: id, metadata: { channel: "email" } });
  return NextResponse.json({ sent: true });
}
