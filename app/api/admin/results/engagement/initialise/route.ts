import { isAdminAuthenticated } from "@/lib/adminAuth";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { initialiseEngagementEvaluations } from "@/lib/lms/resultService";
export async function POST(request: Request) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const body = await readJsonObject(request); if (typeof body?.student_enrollment_id !== "string") return Response.json({ message: "A valid student enrolment is required." }, { status: 400 }); try { return Response.json({ initialized: await initialiseEngagementEvaluations(requireLmsAdminClient(), body.student_enrollment_id, { actorLabel: "REALMS Admin" }) }); } catch (error) { return lmsApiError(error, "Engagement evaluation could not be prepared."); } }
