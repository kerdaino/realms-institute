import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { updateRecoveryPlan } from "@/lib/lms/engagementActions";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (!isUuid(id) || !body) return Response.json({ message: "A valid recovery-plan update is required." }, { status: 400 }); try { return Response.json({ plan: await updateRecoveryPlan(requireLmsAdminClient(), id, body, { actorLabel: "REALMS Admin", actorType: "admin" }) }); } catch (error) { return lmsApiError(error, "Recovery plan could not be updated."); } }
