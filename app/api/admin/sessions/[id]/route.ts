import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { fetchAdminSession } from "@/lib/lms/sessionData";
import { updateClassSession } from "@/lib/lms/sessionService";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const { id } = await params; if (!isUuid(id)) return NextResponse.json({ message: "Class session not found." }, { status: 404 }); try { return NextResponse.json(await fetchAdminSession(requireLmsAdminClient(), id)); } catch (error) { return lmsApiError(error, "Class session could not be loaded."); } }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const { id } = await params; const body = await readJsonObject(request); if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid class session request is required." }, { status: 400 }); try { return NextResponse.json({ session: await updateClassSession(requireLmsAdminClient(), id, body, { actorLabel: "REALMS Admin" }) }); } catch (error) { return lmsApiError(error, "Class session could not be updated."); } }
