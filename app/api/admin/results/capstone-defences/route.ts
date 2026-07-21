import { isAdminAuthenticated } from "@/lib/adminAuth";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { saveCapstoneDefence } from "@/lib/lms/resultService";
export async function POST(request: Request) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const body = await readJsonObject(request); if (!body) return Response.json({ message: "Valid capstone-defence evidence is required." }, { status: 400 }); try { return Response.json({ defence: await saveCapstoneDefence(requireLmsAdminClient(), body, { actorLabel: "REALMS Admin" }) }); } catch (error) { return lmsApiError(error, "Capstone defence could not be saved."); } }
