import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { evaluateCohortEngagement } from "@/lib/lms/engagementService";

export async function POST(request: Request) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const body = await readJsonObject(request); const id = typeof body?.cohort_id === "string" ? body.cohort_id : ""; if (!isUuid(id)) return Response.json({ message: "A valid cohort is required." }, { status: 400 }); try { return Response.json(await evaluateCohortEngagement(requireLmsAdminClient(), id, { actorLabel: "REALMS Admin" })); } catch (error) { return lmsApiError(error, "Cohort engagement could not be evaluated."); } }
