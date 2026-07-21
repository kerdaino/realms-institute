import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { resolveStudentWarningNotice } from "@/lib/lms/engagementActions";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (!isUuid(id) || !body) return Response.json({ message: "A valid resolution is required." }, { status: 400 }); try { return Response.json({ notice: await resolveStudentWarningNotice(requireLmsAdminClient(), id, body, { actorLabel: "REALMS Admin", actorType: "admin" }) }); } catch (error) { return lmsApiError(error, "Notice could not be resolved."); } }
