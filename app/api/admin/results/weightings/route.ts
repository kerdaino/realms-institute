import { isAdminAuthenticated } from "@/lib/adminAuth";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { saveAssessmentWeighting } from "@/lib/lms/resultService";
export async function POST(request: Request) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const body = await readJsonObject(request); if (!body) return Response.json({ message: "A valid assessment weighting is required." }, { status: 400 }); try { return Response.json({ weighting: await saveAssessmentWeighting(requireLmsAdminClient(), body, { actorLabel: "REALMS Admin" }) }); } catch (error) { return lmsApiError(error, "Assessment weighting could not be saved."); } }
