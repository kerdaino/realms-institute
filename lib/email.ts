import "server-only";

export type EmailSendResult = { sent: true; id?: string } | { sent: false; reason: string };

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

const resendEndpoint = "https://api.resend.com/emails";
const emailTimeoutMs = 15000;

function emailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const replyTo = process.env.REALMS_ADMIN_EMAIL?.trim() || "gloryrealm2025@gmail.com";
  return apiKey && from ? { apiKey, from, replyTo } : null;
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

export async function sendEmail({ to, subject, html, text, replyTo }: SendEmailParams): Promise<EmailSendResult> {
  const config = emailConfig();
  const finalReplyTo = replyTo || process.env.REALMS_ADMIN_EMAIL || "gloryrealm2025@gmail.com";
  console.log("Resend direct fetch email attempt:", {
    to,
    subject,
    hasApiKey: Boolean(process.env.RESEND_API_KEY),
    from: process.env.RESEND_FROM_EMAIL,
    replyTo: finalReplyTo,
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
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
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
      console.error("Resend API error:", JSON.stringify({
        status: response.status,
        body: data,
      }));
      const message = typeof data === "object" && data && "message" in data && typeof data.message === "string"
        ? data.message
        : "Email failed to send.";
      return { sent: false, reason: message };
    }

    console.log("Resend direct fetch email result:", data);
    const id = typeof data === "object" && data && "id" in data && typeof data.id === "string" ? data.id : undefined;
    return { sent: true, id };
  } catch (error) {
    console.error("Resend fetch failed:", JSON.stringify(fetchErrorDetails(error)));
    return { sent: false, reason: "Email request failed." };
  } finally {
    clearTimeout(timeout);
  }
}
