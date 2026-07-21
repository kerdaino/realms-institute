import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { assignStudentMentor } from "@/lib/lms/engagementActions";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (!isUuid(id) || !body) return Response.json({ message: "A valid mentor assignment is required." }, { status: 400 }); try { return Response.json(await assignStudentMentor(requireLmsAdminClient(), id, body, { actorLabel: "REALMS Admin", actorType: "admin" })); } catch (error) { return lmsApiError(error, "Mentor could not be assigned."); } }
