import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { evaluateStudentEngagement } from "@/lib/lms/engagementService";

export async function POST(request: Request) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const body = await readJsonObject(request); const id = typeof body?.student_enrollment_id === "string" ? body.student_enrollment_id : ""; if (!isUuid(id)) return Response.json({ message: "A valid student enrolment is required." }, { status: 400 }); try { return Response.json(await evaluateStudentEngagement(requireLmsAdminClient(), id, { actorLabel: "REALMS Admin" })); } catch (error) { return lmsApiError(error, "Student engagement could not be evaluated."); } }
