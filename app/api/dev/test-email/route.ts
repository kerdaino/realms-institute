import { NextResponse } from "next/server";

import { sendEmail } from "@/lib/email";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const payload = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const to = typeof payload.to === "string" ? payload.to.trim() : "";
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ message: "A valid recipient email is required." }, { status: 400 });
  }

  const result = await sendEmail({
    to,
    subject: "REALMS Test Email",
    html: "<p>This is a test email from REALMS Institute.</p>",
    text: "This is a test email from REALMS Institute.",
  });

  return NextResponse.json({ emailStatus: result });
}
