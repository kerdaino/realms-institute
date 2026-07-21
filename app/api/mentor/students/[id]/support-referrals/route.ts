import { isUuid } from "@/lib/lms/adminConstants";
import { createSupportReferral } from "@/lib/lms/engagementActions";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireMentorContext } from "@/lib/lms/engagementAuth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (!isUuid(id) || !body) return Response.json({ message: "A valid support referral is required." }, { status: 400 }); try { const { user, supabase, assignments } = await requireMentorContext(id); return Response.json({ referral: await createSupportReferral(supabase, id, assignments[0].id, body, { actorLabel: "Assigned Mentor", actorUserId: user.id, actorType: "mentor" }) }, { status: 201 }); } catch (error) { return lmsApiError(error, "Support referral could not be created."); } }
