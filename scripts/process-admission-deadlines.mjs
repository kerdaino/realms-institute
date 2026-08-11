import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase administrative environment variables are required.");

const apply = process.argv.includes("--apply");
if (apply && process.env.ADMISSION_DEADLINES_APPLY !== "1") {
  throw new Error("Set ADMISSION_DEADLINES_APPLY=1 as well as --apply before lapsing expired offers.");
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const now = new Date().toISOString();
const actor = "REALMS Admissions Deadline Process";
const candidateResult = await supabase
  .from("registrations")
  .select("id, full_name, email, admission_payment_deadline")
  .eq("application_status", "conditional_admission_payment_outstanding")
  .is("deleted_at", null)
  .lt("admission_payment_deadline", now)
  .order("admission_payment_deadline");
if (candidateResult.error) throw new Error(`Expired conditional offers could not be loaded: ${candidateResult.error.message}`);

const candidates = candidateResult.data ?? [];
const lapsedIds = [];
const emailResults = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

async function sendLapsedEmail(registration) {
  const subject = "REALMS Institute — Conditional Admission Offer Lapsed";
  const text = `Dear ${registration.full_name},\n\nThe payment deadline for your conditional REALMS admission offer passed without a verified payment satisfying the outstanding registration requirement. The offer has therefore lapsed. You were not provisioned or enrolled as an active student.\n\nApplication, decision and communication history remain preserved. Please contact REALMS Admissions if you need the deadline reviewed.\n\nWith joy in Christ,\nREALMS Institute`;
  const html = `<div style="font-family:Arial,sans-serif;color:#071327;line-height:1.7;max-width:640px;margin:auto"><h1 style="font-size:24px">Conditional Admission Offer Lapsed</h1><p>Dear ${escapeHtml(registration.full_name)},</p><p>The payment deadline for your conditional REALMS admission offer passed without a verified payment satisfying the outstanding registration requirement. The offer has therefore lapsed.</p><p>You were not provisioned or enrolled as an active student. Application, decision and communication history remain preserved.</p><p>Please contact REALMS Admissions if you need the deadline reviewed.</p><p>With joy in Christ,<br><strong>REALMS Institute</strong></p></div>`;
  const attemptedAt = new Date().toISOString();
  let delivery = { sent: false, reason: "Email is not configured." };
  if (process.env.RESEND_API_KEY?.trim()) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`, "Content-Type": "application/json", "Idempotency-Key": `realms-admission-${registration.id}-admission-offer-lapsed-${registration.admission_payment_deadline}`.slice(0, 256) },
        body: JSON.stringify({ from: "REALMS Institute <admissions@mail.grccglobal.org>", to: registration.email, subject, html, text, reply_to: "gloryrealm2025@gmail.com" }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await response.json().catch(() => ({}));
      delivery = response.ok ? { sent: true, id: typeof data.id === "string" ? data.id : null } : { sent: false, reason: typeof data.message === "string" ? data.message : "Email failed to send." };
    } catch {
      delivery = { sent: false, reason: "Email request failed." };
    }
  }
  const event = await supabase.from("registration_communication_events").insert({
    registration_id: registration.id,
    communication_type: "admission_offer_lapsed",
    recipient_email: registration.email,
    subject_snapshot: subject,
    content_snapshot: { html, text },
    delivery_status: delivery.sent ? "sent" : "failed",
    provider_message_id: delivery.sent ? delivery.id : null,
    provider_error: delivery.sent ? null : delivery.reason.slice(0, 1000),
    attempted_at: attemptedAt,
    sent_at: delivery.sent ? attemptedAt : null,
  });
  if (event.error) throw new Error(`Communication audit could not be preserved for ${registration.id}: ${event.error.message}`);
  return delivery;
}

if (apply) {
  for (const registration of candidates) {
    const changedAt = new Date().toISOString();
    const changed = await supabase.from("registrations").update({ application_status: "admission_offer_lapsed_payment_outstanding", admission_offer_lapsed_at: changedAt, reviewed_at: changedAt, reviewed_by: actor }).eq("id", registration.id).eq("application_status", "conditional_admission_payment_outstanding").select("id").maybeSingle();
    if (changed.error) throw new Error(`Offer ${registration.id} could not be lapsed: ${changed.error.message}`);
    if (!changed.data) continue;
    const audit = await supabase.from("registration_review_events").insert({ registration_id: registration.id, event_type: "conditional_admission_offer_lapsed", previous_state: { application_status: "conditional_admission_payment_outstanding", admission_payment_deadline: registration.admission_payment_deadline }, new_state: { application_status: "admission_offer_lapsed_payment_outstanding", admission_offer_lapsed_at: changedAt }, note: "Conditional admission payment deadline passed without a verified payment satisfying the financial requirement.", actor });
    if (audit.error) throw new Error(`Offer ${registration.id} lapsed but its review audit failed: ${audit.error.message}`);
    lapsedIds.push(registration.id);
    const delivery = await sendLapsedEmail(registration);
    emailResults.push({ registrationId: registration.id, sent: delivery.sent, reason: delivery.sent ? null : delivery.reason });
  }
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", candidateCount: candidates.length, candidates, lapsedIds, emailResults }, null, 2));
