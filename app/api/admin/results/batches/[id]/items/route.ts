import { isAdminAuthenticated } from "@/lib/adminAuth";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { addResultToBatch } from "@/lib/lms/resultService";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (typeof body?.student_programme_result_id !== "string") return Response.json({ message: "Choose a calculated programme result." }, { status: 400 }); try { return Response.json({ item: await addResultToBatch(requireLmsAdminClient(), id, body.student_programme_result_id) }); } catch (error) { return lmsApiError(error, "Programme result could not be added to the batch."); } }
