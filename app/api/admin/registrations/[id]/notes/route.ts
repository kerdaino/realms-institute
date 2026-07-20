import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { adminRegistrationFields, adminRegistrationListFields } from "@/lib/adminRegistrations";
import { adminReviewer } from "@/lib/adminReviewAudit";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ message: "Supabase is not configured." }, { status: 503 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
  const body = await request.json().catch(() => null);
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  if (typeof payload.adminNote !== "string") return NextResponse.json({ message: "A valid admin note is required." }, { status: 400 });
  const adminNote = payload.adminNote.trim().slice(0, 5000) || null;
  const { data, error } = await supabase.from("registrations").update({ admin_note: adminNote, admin_note_updated_at: new Date().toISOString(), admin_note_updated_by: adminReviewer }).eq("id", id).select(adminRegistrationFields).maybeSingle();
  if (error?.code === "42703") {
    const legacyResult = await supabase.from("registrations").update({ admin_note: adminNote }).eq("id", id).select(adminRegistrationListFields).maybeSingle();
    if (legacyResult.error) {
      console.error("Legacy admin note update failed", legacyResult.error);
      return NextResponse.json({ message: "Admin note could not be saved." }, { status: 500 });
    }
    if (!legacyResult.data) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
    return NextResponse.json({ registration: legacyResult.data, message: "Admin note saved. Apply the latest schema migration to record note reviewer details." });
  }
  if (error) {
    console.error("Admin note update failed", error);
    return NextResponse.json({ message: "Admin note could not be saved." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
  return NextResponse.json({ registration: data, message: "Admin note saved." });
}
