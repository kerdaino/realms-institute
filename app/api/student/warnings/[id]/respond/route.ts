import { isUuid } from "@/lib/lms/adminConstants";
import { respondToWarning } from "@/lib/lms/engagementActions";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireStudentStandingContext } from "@/lib/lms/engagementAuth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); const response = typeof body?.response === "string" ? body.response : ""; if (!isUuid(id) || !body) return Response.json({ message: "A valid response is required." }, { status: 400 }); try { const context = await requireStudentStandingContext(); return Response.json({ notice: await respondToWarning(context.supabase, id, context.studentEnrollmentId, response, { actorLabel: "Student", actorUserId: context.user.id, actorType: "student" }) }); } catch (error) { return lmsApiError(error, "Your response could not be saved."); } }
