import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { requireMentorContext } from "@/lib/lms/engagementAuth";
import { fetchMentorStudentDetail } from "@/lib/lms/engagementData";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; if (!isUuid(id)) return Response.json({ message: "Student not found." }, { status: 404 }); try { const { user, supabase } = await requireMentorContext(id); return Response.json(await fetchMentorStudentDetail(supabase, user.id, id)); } catch (error) { return lmsApiError(error, "Mentor student record could not be loaded."); } }
