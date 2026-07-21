import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { setClassSummaryStatus } from "@/lib/lms/sessionService";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const { id } = await params; if (!isUuid(id)) return NextResponse.json({ message: "Class session not found." }, { status: 404 }); try { return NextResponse.json({ summary: await setClassSummaryStatus(requireLmsAdminClient(), id, "archived", { actorLabel: "REALMS Admin" }) }); } catch (error) { return lmsApiError(error, "Class summary could not be archived."); } }
