import { isAdminAuthenticated } from "@/lib/adminAuth";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { overrideGraduationRequirement } from "@/lib/lms/resultService";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (!body) return Response.json({ message: "A reasoned requirement override is required." }, { status: 400 }); try { return Response.json({ requirement: await overrideGraduationRequirement(requireLmsAdminClient(), id, body, { actorLabel: "REALMS Admin" }) }); } catch (error) { return lmsApiError(error, "Graduation requirement override could not be saved."); } }
