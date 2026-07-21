import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { confirmFinalEnrollmentOutcome, updateReviewCase } from "@/lib/lms/engagementActions";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (!isUuid(id) || !body) return Response.json({ message: "A valid review-case update is required." }, { status: 400 }); try { if (body.final_outcome) return Response.json(await confirmFinalEnrollmentOutcome(requireLmsAdminClient(), id, { ...body, outcome: body.final_outcome }, { actorLabel: "REALMS Admin", actorType: "admin" })); return Response.json({ reviewCase: await updateReviewCase(requireLmsAdminClient(), id, body, { actorLabel: "REALMS Admin", actorType: "admin" }) }); } catch (error) { return lmsApiError(error, "Review case could not be updated."); } }
