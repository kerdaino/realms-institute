import { isUuid } from "@/lib/lms/adminConstants";
import { recordMentorFollowup } from "@/lib/lms/engagementActions";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireMentorContext } from "@/lib/lms/engagementAuth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (!isUuid(id) || !body) return Response.json({ message: "A valid follow-up is required." }, { status: 400 }); try { const { user, supabase, assignments } = await requireMentorContext(id); return Response.json({ followup: await recordMentorFollowup(supabase, assignments[0].id, body, { actorLabel: "Assigned Mentor", actorUserId: user.id, actorType: "mentor" }) }, { status: 201 }); } catch (error) { return lmsApiError(error, "Mentor follow-up could not be recorded."); } }
