import { isAdminAuthenticated } from "@/lib/adminAuth";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { createRecoveryPlan } from "@/lib/lms/engagementActions";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";

export async function POST(request: Request) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const body = await readJsonObject(request); if (!body) return Response.json({ message: "A valid recovery plan is required." }, { status: 400 }); try { return Response.json({ plan: await createRecoveryPlan(requireLmsAdminClient(), body, { actorLabel: "REALMS Admin", actorType: "admin" }) }, { status: 201 }); } catch (error) { return lmsApiError(error, "Recovery plan could not be created."); } }
