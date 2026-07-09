import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { adminRegistrationFields } from "@/lib/adminRegistrations";
import { sendRegistrationEmailsIfNeeded } from "@/lib/registrationEmails";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ message: "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to resend emails." }, { status: 503 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Registration not found." }, { status: 404 });

  const { data, error } = await supabase
    .from("registrations")
    .select(adminRegistrationFields)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Admin resend emails registration query failed", error);
    return NextResponse.json({ message: "Registration could not be loaded." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ message: "Registration not found." }, { status: 404 });

  const emailStatus = await sendRegistrationEmailsIfNeeded(data, { force: true });
  const { data: refreshed, error: refreshError } = await supabase
    .from("registrations")
    .select(adminRegistrationFields)
    .eq("id", id)
    .maybeSingle();

  if (refreshError) {
    console.error("Admin resend emails refresh failed", refreshError);
  }

  return NextResponse.json({ emailStatus, registration: refreshed || data });
}
