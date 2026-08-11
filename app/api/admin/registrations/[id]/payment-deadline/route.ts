import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { adminRegistrationListFields } from "@/lib/adminRegistrations";
import { conditionalAdmissionStatus, lapsedConditionalAdmissionStatus } from "@/lib/conditionalAdmission";
import { sendAdmissionCommunication } from "@/lib/registrationEmails";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Application not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const newDeadlineValue = typeof body?.newDeadline === "string" ? body.newDeadline.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 2000) : "";
  const sendEmail = body?.sendEmail !== false;
  const newDeadline = new Date(newDeadlineValue);
  if (!newDeadlineValue || !Number.isFinite(newDeadline.valueOf())) return NextResponse.json({ message: "Enter a valid new payment deadline." }, { status: 400 });
  if (newDeadline.valueOf() <= Date.now()) return NextResponse.json({ message: "The new payment deadline must be in the future." }, { status: 400 });
  if (!reason) return NextResponse.json({ message: "Record the reason for extending the payment deadline." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ message: "The registration service is temporarily unavailable." }, { status: 503 });
  const current = await supabase.from("registrations").select("id, application_status, admission_payment_deadline").eq("id", id).is("deleted_at", null).maybeSingle();
  if (current.error || !current.data) return NextResponse.json({ message: "Application not found." }, { status: 404 });
  if (![conditionalAdmissionStatus, lapsedConditionalAdmissionStatus].includes(current.data.application_status as typeof conditionalAdmissionStatus)) {
    return NextResponse.json({ message: "A payment deadline can be extended only for a conditional or lapsed payment-outstanding offer." }, { status: 409 });
  }
  if (current.data.admission_payment_deadline && newDeadline.valueOf() <= Date.parse(current.data.admission_payment_deadline)) {
    return NextResponse.json({ message: "The new deadline must be later than the currently recorded deadline." }, { status: 400 });
  }

  const changedAt = new Date().toISOString();
  const saved = await supabase.from("registrations").update({
    admission_payment_deadline: newDeadline.toISOString(),
    payment_deadline_extended_at: changedAt,
    payment_deadline_extended_by: "REALMS Admin",
    payment_deadline_extension_reason: reason,
    reviewed_at: changedAt,
    reviewed_by: "REALMS Admin",
  }).eq("id", id).eq("application_status", current.data.application_status).select(adminRegistrationListFields).maybeSingle();
  if (saved.error || !saved.data) return NextResponse.json({ message: "The payment deadline could not be extended safely." }, { status: 409 });
  await supabase.from("registration_review_events").insert({
    registration_id: id,
    event_type: "conditional_admission_payment_deadline_extended",
    previous_state: { application_status: current.data.application_status, admission_payment_deadline: current.data.admission_payment_deadline },
    new_state: { application_status: current.data.application_status, admission_payment_deadline: newDeadline.toISOString() },
    note: reason,
    actor: "REALMS Admin",
    created_at: changedAt,
  });
  const emailStatus = sendEmail && current.data.application_status === conditionalAdmissionStatus ? await sendAdmissionCommunication(id, "payment_deadline_extended") : null;
  return NextResponse.json({
    registration: saved.data,
    emailStatus,
    reactivated: false,
    message: current.data.application_status === lapsedConditionalAdmissionStatus
      ? "Payment deadline extended. The lapsed offer was not reactivated; use the admission review deliberately if reactivation is approved."
      : "Payment deadline extended.",
  });
}
