import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { issueStudentWarningNotice } from "@/lib/lms/engagementActions";
import { lmsApiError } from "@/lib/lms/apiResponse";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const { id } = await params; if (!isUuid(id)) return Response.json({ message: "Notice not found." }, { status: 404 }); try { return Response.json(await issueStudentWarningNotice(requireLmsAdminClient(), id, { actorLabel: "REALMS Admin", actorType: "admin" })); } catch (error) { return lmsApiError(error, "Notice could not be issued."); } }
