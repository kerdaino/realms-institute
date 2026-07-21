import { isAdminAuthenticated } from "@/lib/adminAuth";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { moderateComponentScore } from "@/lib/lms/resultService";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (!body) return Response.json({ message: "Evidence-based moderation details are required." }, { status: 400 }); try { return Response.json({ component: await moderateComponentScore(requireLmsAdminClient(), id, body, { actorLabel: "REALMS Admin" }) }); } catch (error) { return lmsApiError(error, "Component score could not be moderated."); } }
