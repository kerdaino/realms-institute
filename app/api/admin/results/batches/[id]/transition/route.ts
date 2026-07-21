import { isAdminAuthenticated } from "@/lib/adminAuth";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { sendResultPublishedEmail } from "@/lib/lms/resultEmail";
import { transitionResultBatch } from "@/lib/lms/resultService";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (!body) return Response.json({ message: "Choose a result-batch action." }, { status: 400 }); try { const supabase = requireLmsAdminClient(); return Response.json({ batch: await transitionResultBatch(supabase, id, body, { actorLabel: "REALMS Admin" }, (studentEnrollmentId) => sendResultPublishedEmail(supabase, studentEnrollmentId)) }); } catch (error) { return lmsApiError(error, "Result batch could not be updated."); } }
