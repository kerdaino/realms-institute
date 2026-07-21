import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { fetchQuizDetail } from "@/lib/lms/assessmentData";
import { saveQuiz } from "@/lib/lms/assessmentService";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const { id } = await params; if (!isUuid(id)) return NextResponse.json({ message: "Quiz not found." }, { status: 404 }); try { return NextResponse.json(await fetchQuizDetail(requireLmsAdminClient(), id)); } catch (error) { return lmsApiError(error, "Quiz could not be loaded."); } }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); const [{ id }, body] = await Promise.all([params, readJsonObject(request)]); if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid quiz request is required." }, { status: 400 }); try { return NextResponse.json({ quiz: await saveQuiz(requireLmsAdminClient(), body, { actorLabel: "REALMS Admin" }, id) }); } catch (error) { return lmsApiError(error, "Quiz could not be updated."); } }
