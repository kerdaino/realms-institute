import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { adminRegistrationFields } from "@/lib/adminRegistrations";
import { isApplicationStatus } from "@/lib/applicationStatus";
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
  const adminNote = typeof payload.adminNote === "string" ? payload.adminNote.trim().slice(0, 2000) : "";

  if (!isApplicationStatus(status)) return NextResponse.json({ message: "A valid application status is required." }, { status: 400 });

  const { data, error } = await supabase
    .from("registrations")
    .update({
      application_status: status,
      admin_note: adminNote || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: "REALMS Admin",
    })
    .eq("id", id)
    .select(adminRegistrationFields)
    .maybeSingle();

  if (error) {
    console.error("Admin registration status update failed", error);
    return NextResponse.json({ message: "Review status could not be saved." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ message: "Registration not found." }, { status: 404 });

  return NextResponse.json({ registration: data });
}
