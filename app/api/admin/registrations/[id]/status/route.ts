import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { adminRegistrationListFields } from "@/lib/adminRegistrations";
import { isApplicationStatus } from "@/lib/applicationStatus";
import { sendApplicationStatusEmail } from "@/lib/registrationEmails";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ message: "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to update registrations." }, { status: 503 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Registration not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const payload = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const status = typeof payload.applicationStatus === "string" ? payload.applicationStatus.trim() : "";
  const hasAdminNote = Object.hasOwn(payload, "adminNote");
  const adminNote = typeof payload.adminNote === "string" ? payload.adminNote.trim().slice(0, 5000) : "";
  const shouldSendEmail = payload.sendEmail === true;

  if (!isApplicationStatus(status)) return NextResponse.json({ message: "A valid application status is required." }, { status: 400 });

  const update: Record<string, unknown> = {
    application_status: status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: "REALMS Admin",
  };
  if (hasAdminNote) update.admin_note = adminNote || null;

  const { data, error } = await supabase
    .from("registrations")
    .update(update)
    .eq("id", id)
    .select(adminRegistrationListFields)
    .maybeSingle();

  if (error) {
    console.error("Admin registration status update failed", error);
    return NextResponse.json({ message: "Review status could not be saved." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ message: "Registration not found." }, { status: 404 });

  const emailStatus = shouldSendEmail ? await sendApplicationStatusEmail(data) : null;

  const { data: refreshed, error: refreshError } = await supabase
    .from("registrations")
    .select(adminRegistrationListFields)
    .eq("id", id)
    .maybeSingle();

  if (refreshError) {
    console.error("Admin registration refresh after status update failed", refreshError);
  }

  return NextResponse.json({ registration: refreshed || data, emailStatus });
}
