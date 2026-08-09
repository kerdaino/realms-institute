import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { adminReviewer } from "@/lib/adminReviewAudit";
import { validateApplicationRemoval } from "@/lib/applicationLifecycle";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ message: "The registration service is temporarily unavailable." }, { status: 503 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Application not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const validation = validateApplicationRemoval({
    confirmation: payload.confirmation,
    reason: payload.reason,
    note: payload.note,
    supersededByApplicationId: payload.supersededByApplicationId,
  });
  if (!validation.success) return NextResponse.json({ message: validation.message }, { status: 400 });
  if (validation.data.supersededByApplicationId === id) return NextResponse.json({ message: "An application cannot supersede itself." }, { status: 400 });

  const { error } = await supabase.rpc("soft_delete_registration", {
    target_registration_id: id,
    deletion_actor: adminReviewer,
    deletion_reason_value: validation.data.reason,
    deletion_note_value: validation.data.note,
    superseding_registration_id: validation.data.supersededByApplicationId,
  });
  if (error) {
    console.error("Controlled application removal failed", { code: error.code });
    const conflict = error.message.includes("already deleted") || error.message.includes("application to keep") || error.message.includes("same applicant email and cohort");
    const missingMigration = error.code === "PGRST202" || error.message.includes("soft_delete_registration");
    return NextResponse.json({
      message: missingMigration
        ? "Apply the application soft-delete migration before removing applications."
        : conflict ? error.message : "The application could not be removed safely.",
    }, { status: missingMigration ? 503 : conflict ? 409 : 500 });
  }
  return NextResponse.json({ message: "Application removed from active admissions. Historical decisions, payments, communications, and student records were preserved." });
}
