import { NextResponse } from "next/server";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { fetchFacilitatorSession, resolveFacilitatorSessionContext } from "@/lib/lms/facilitatorSessions";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; if (!isUuid(id)) return NextResponse.json({ message: "Class session not found." }, { status: 404 }); try { const context = await resolveFacilitatorSessionContext(); return NextResponse.json(await fetchFacilitatorSession(context, id)); } catch (error) { return lmsApiError(error, "Assigned class session could not be loaded."); } }
