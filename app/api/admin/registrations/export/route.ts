import { isAdminAuthenticated } from "@/lib/adminAuth";
import { fetchAdminRegistrations, readRegistrationFilters, type AdminRegistration } from "@/lib/adminRegistrations";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function csv(value: unknown) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function row(registration: AdminRegistration) {
  return [registration.full_name, registration.email, registration.whatsapp, registration.country, registration.city, registration.gender, registration.age_range, registration.church, registration.learning_mode, registration.skill_pathway, registration.reason, registration.referral_source, registration.fee_policy_consent ? "Yes" : "No", registration.computer_access_confirmed ? "Yes" : "No", registration.public_fee_display, registration.amount_display, registration.amount, registration.currency, registration.payment_reference, registration.payment_status, registration.application_status, registration.admin_note, registration.reviewed_at, registration.reviewed_by, registration.paid_at, registration.created_at].map(csv).join(",");
}

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return Response.json({ message: "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to view registrations." }, { status: 503 });
  try {
    const registrations = await fetchAdminRegistrations(supabase, readRegistrationFilters(new URL(request.url).searchParams));
    const headings = ["Full Name", "Email", "WhatsApp", "Country", "City", "Gender", "Age Range", "Church", "Learning Mode", "Skill Pathway", "Reason", "Referral Source", "Fee Policy Consent", "Computer Access Confirmed", "Public Fee", "Amount Paid", "Amount", "Currency", "Payment Reference", "Payment Status", "Application Status", "Admin Note", "Reviewed At", "Reviewed By", "Paid At", "Created At"].map(csv).join(",");
    return new Response(`\uFEFF${headings}\r\n${registrations.map(row).join("\r\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="realms-registrations.csv"', "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin CSV export failed", error);
    return Response.json({ message: "Registrations could not be exported." }, { status: 500 });
  }
}
