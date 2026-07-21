import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { fetchPortalAccountEvidence, PortalAccessError, provisionStudentPortalAccess } from "@/lib/lms/portalInvite";
import { requireLmsAdminClient } from "@/lib/lms/adminData";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ message: "Student not found." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const result = await provisionStudentPortalAccess(id, { recovery: body.mode === "recovery" });
    const student = await requireLmsAdminClient().from("students").select("profile_id").eq("id", id).single();
    const portalAccount = await fetchPortalAccountEvidence(requireLmsAdminClient(), { profileId: student.data?.profile_id ?? null, entityType: "student", entityId: id });
    return NextResponse.json({ ...result, portalAccount }, { status: result.sent ? 200 : 502 });
  } catch (error) {
    if (error instanceof PortalAccessError) return NextResponse.json({ message: error.message }, { status: error.status });
    console.error("Student portal access failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ message: "Portal access could not be prepared." }, { status: 500 });
  }
}
