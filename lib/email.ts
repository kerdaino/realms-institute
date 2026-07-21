import "server-only";

export type EmailSendResult = { sent: true; id?: string } | { sent: false; reason: string };

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  idempotencyKey?: string;
};

const resendEndpoint = "https://api.resend.com/emails";
const emailTimeoutMs = 15000;
export const realmsEmailFrom = "REALMS Institute <admissions@mail.grccglobal.org>";
export const realmsEmailReplyTo = "gloryrealm2025@gmail.com";

function emailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  return apiKey ? { apiKey, from: realmsEmailFrom, replyTo: realmsEmailReplyTo } : null;
}

function fetchErrorDetails(error: unknown) {
  if (!(error instanceof Error)) return error;
  const cause = error.cause;
  return {
    name: error.name,
    message: error.message,
    cause: cause instanceof Error ? { name: cause.name, message: cause.message } : cause,
  };
}

export async function sendEmail({ to, subject, html, text, replyTo, idempotencyKey }: SendEmailParams): Promise<EmailSendResult> {
  const config = emailConfig();
  const finalReplyTo = replyTo || realmsEmailReplyTo;
  console.log("Resend direct fetch email attempt:", {
    subject,
    hasApiKey: Boolean(process.env.RESEND_API_KEY),
    from: realmsEmailFrom,
  });
  if (!config) return { sent: false, reason: "Email is not configured." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), emailTimeoutMs);
  try {
    const response = await fetch(resendEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from: config.from,
        to,
        subject,
        html,
        text,
        reply_to: finalReplyTo,
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const providerCode = typeof data === "object" && data && "name" in data && typeof data.name === "string" ? data.name : undefined;
      console.error("Resend API error:", { status: response.status, providerCode });
      const message = typeof data === "object" && data && "message" in data && typeof data.message === "string"
        ? data.message
        : "Email failed to send.";
      return { sent: false, reason: message };
    }

    const id = typeof data === "object" && data && "id" in data && typeof data.id === "string" ? data.id : undefined;
    console.log("Resend direct fetch email result:", { sent: true, id });
    return { sent: true, id };
  } catch (error) {
    console.error("Resend fetch failed:", JSON.stringify(fetchErrorDetails(error)));
    return { sent: false, reason: "Email request failed." };
  } finally {
    clearTimeout(timeout);
  }
}
