import { isUuid } from "@/lib/lms/adminConstants";
import { acknowledgeWarning } from "@/lib/lms/engagementActions";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { requireStudentStandingContext } from "@/lib/lms/engagementAuth";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; if (!isUuid(id)) return Response.json({ message: "Notice not found." }, { status: 404 }); try { const context = await requireStudentStandingContext(); return Response.json({ notice: await acknowledgeWarning(context.supabase, id, context.studentEnrollmentId, { actorLabel: "Student", actorUserId: context.user.id, actorType: "student" }) }); } catch (error) { return lmsApiError(error, "Notice acknowledgement could not be saved."); } }
