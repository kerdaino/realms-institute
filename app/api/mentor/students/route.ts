import { lmsApiError } from "@/lib/lms/apiResponse";
import { requireMentorContext } from "@/lib/lms/engagementAuth";
import { fetchMentorStudents } from "@/lib/lms/engagementData";

export async function GET() { try { const { user, supabase } = await requireMentorContext(); return Response.json({ students: await fetchMentorStudents(supabase, user.id) }); } catch (error) { return lmsApiError(error, "Mentor caseload could not be loaded."); } }
