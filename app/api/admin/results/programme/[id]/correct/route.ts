import { isAdminAuthenticated } from "@/lib/adminAuth";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { correctProgrammeResult } from "@/lib/lms/resultService";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (!body) return Response.json({ message: "A controlled correction request is required." }, { status: 400 }); try { return Response.json({ result: await correctProgrammeResult(requireLmsAdminClient(), id, body, { actorLabel: "REALMS Admin" }) }); } catch (error) { return lmsApiError(error, "Programme result correction could not be saved."); } }
