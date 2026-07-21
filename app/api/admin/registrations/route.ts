import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { fetchAdminRegistrations, readRegistrationFilters, summarizeRegistrations } from "@/lib/adminRegistrations";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ message: "The registration service is temporarily unavailable." }, { status: 503 });
  try {
    const registrations = await fetchAdminRegistrations(supabase, readRegistrationFilters(new URL(request.url).searchParams));
    return NextResponse.json({ registrations, summary: summarizeRegistrations(registrations) });
  } catch (error) {
    console.error("Admin registrations query failed", error);
    return NextResponse.json({ message: "Registrations could not be loaded." }, { status: 500 });
  }
}
