import { NextResponse } from "next/server";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { fetchFacilitatorSessions, resolveFacilitatorSessionContext } from "@/lib/lms/facilitatorSessions";
export async function GET() { try { const context = await resolveFacilitatorSessionContext(); return NextResponse.json({ sessions: await fetchFacilitatorSessions(context) }); } catch (error) { return lmsApiError(error, "Assigned class sessions could not be loaded."); } }
