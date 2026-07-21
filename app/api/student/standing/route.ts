import { lmsApiError } from "@/lib/lms/apiResponse";
import { requireStudentStandingContext } from "@/lib/lms/engagementAuth";
import { fetchStudentStanding } from "@/lib/lms/engagementData";

export async function GET() { try { const { user, supabase } = await requireStudentStandingContext(); return Response.json(await fetchStudentStanding(supabase, user.id)); } catch (error) { return lmsApiError(error, "Your standing information could not be loaded."); } }
