import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { sendCurrentScholarshipDecisionEmail } from "@/lib/registrationEmails";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
  const emailStatus = await sendCurrentScholarshipDecisionEmail(id);
  if (!emailStatus.sent) {
    const rateLimited = emailStatus.reason.startsWith("Please wait at least");
    return NextResponse.json({
      emailStatus,
      message: `Scholarship decision email was not sent. ${emailStatus.reason}`,
    }, { status: rateLimited ? 429 : 502 });
  }
  return NextResponse.json({
    emailStatus,
    message: "Scholarship decision email sent using the current saved decision. No scholarship or admission decision was changed.",
  });
}
