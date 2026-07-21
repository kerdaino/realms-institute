import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { fetchPortalAccountEvidence, PortalAccessError, provisionFacilitatorPortalAccess } from "@/lib/lms/portalInvite";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ message: "Facilitator not found." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const result = await provisionFacilitatorPortalAccess(id, { recovery: body.mode === "recovery" });
    const facilitator = await requireLmsAdminClient().from("facilitators").select("profile_id").eq("id", id).single();
    const portalAccount = await fetchPortalAccountEvidence(requireLmsAdminClient(), { profileId: facilitator.data?.profile_id ?? null, entityType: "facilitator", entityId: id });
    return NextResponse.json({ ...result, portalAccount }, { status: result.sent ? 200 : 502 });
  } catch (error) {
    if (error instanceof PortalAccessError) return NextResponse.json({ message: error.message }, { status: error.status });
    console.error("Facilitator portal access failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ message: "Facilitator portal access could not be prepared." }, { status: 500 });
  }
}
