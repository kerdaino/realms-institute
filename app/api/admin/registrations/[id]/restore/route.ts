import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { adminReviewer } from "@/lib/adminReviewAudit";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ message: "The registration service is temporarily unavailable." }, { status: 503 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Application not found." }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || (body as Record<string, unknown>).confirmation !== "RESTORE") {
    return NextResponse.json({ message: "Type RESTORE to confirm restoration." }, { status: 400 });
  }

  const { error } = await supabase.rpc("restore_registration", {
    target_registration_id: id,
    restoration_actor: adminReviewer,
  });
  if (error) {
    console.error("Application restoration failed", { code: error.code });
    const duplicate = error.code === "23505" || error.message.includes("ACTIVE_APPLICATION_ALREADY_EXISTS");
    const conflict = duplicate || error.message.includes("already active");
    const missingMigration = error.code === "PGRST202" || error.message.includes("restore_registration");
    return NextResponse.json({
      message: missingMigration
        ? "Apply the application soft-delete migration before restoring applications."
        : duplicate
          ? "This application cannot be restored while another active application uses the same email for this cohort. Remove or resolve the active duplicate first."
          : conflict ? error.message : "The application could not be restored safely.",
    }, { status: missingMigration ? 503 : conflict ? 409 : 500 });
  }
  return NextResponse.json({ message: "Application restored to active admissions. No emails were resent and no decisions were repeated." });
}
