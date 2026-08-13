import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { sendAdmissionCommunication } from "@/lib/registrationEmails";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Registration not found." }, { status: 404 });

  const emailStatus = await sendAdmissionCommunication(id, "conditional_admission_offer", { force: true });
  if (!emailStatus.sent) {
    return NextResponse.json({
      emailStatus,
      message: `Conditional admission email was not sent. ${emailStatus.reason}`,
    }, { status: 409 });
  }
  return NextResponse.json({
    emailStatus,
    message: "Conditional admission email sent using the current saved offer and financial state. No admission, scholarship, payment, enrolment or provisioning decision was changed.",
  });
}
