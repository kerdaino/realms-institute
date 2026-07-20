import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const scholarshipFields = "id, created_at, full_name, email, applicant_type, requested_discipleship_route, skill_pathway, learning_mode, amount, currency, public_fee_display, scholarship_reason, scholarship_financial_situation, scholarship_can_contribute, scholarship_contribution_amount, scholarship_status, scholarship_approved_amount, scholarship_reviewed_at";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ message: "Supabase is not configured." }, { status: 503 });
  const { data, error } = await supabase.from("registrations").select(scholarshipFields).eq("funding_route", "scholarship_request").order("created_at", { ascending: false }).limit(5000);
  if (error) {
    console.error("Admin scholarship requests query failed", error);
    return NextResponse.json({ message: "Scholarship requests could not be loaded." }, { status: 500 });
  }
  return NextResponse.json({ scholarships: data ?? [] });
}
