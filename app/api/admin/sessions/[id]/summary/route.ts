import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { saveClassSummary } from "@/lib/lms/sessionService";
async function save(request: Request, id: string) { const body = await readJsonObject(request); if (!body) return NextResponse.json({ message: "A valid summary is required." }, { status: 400 }); try { return NextResponse.json(await saveClassSummary(requireLmsAdminClient(), id, body, { actorLabel: "REALMS Admin" })); } catch (error) { return lmsApiError(error, "Class summary could not be saved."); } }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const { id } = await params; if (!isUuid(id)) return NextResponse.json({ message: "Class session not found." }, { status: 404 }); return save(request, id); }
export const PATCH = POST;
