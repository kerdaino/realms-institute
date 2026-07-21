import { isAdminAuthenticated } from "@/lib/adminAuth";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { createReviewCase } from "@/lib/lms/engagementActions";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";

export async function POST(request: Request) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const body = await readJsonObject(request); if (!body) return Response.json({ message: "A valid review case is required." }, { status: 400 }); try { return Response.json({ reviewCase: await createReviewCase(requireLmsAdminClient(), body, { actorLabel: "REALMS Admin", actorType: "admin" }) }, { status: 201 }); } catch (error) { return lmsApiError(error, "Review case could not be opened."); } }
