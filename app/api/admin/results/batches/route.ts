import { isAdminAuthenticated } from "@/lib/adminAuth";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { createResultBatch } from "@/lib/lms/resultService";
export async function POST(request: Request) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const body = await readJsonObject(request); if (!body) return Response.json({ message: "Valid result-batch details are required." }, { status: 400 }); try { return Response.json({ batch: await createResultBatch(requireLmsAdminClient(), body, { actorLabel: "REALMS Admin" }) }, { status: 201 }); } catch (error) { return lmsApiError(error, "Result batch could not be created."); } }
