import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { fetchAtRiskStudentDetail } from "@/lib/lms/engagementData";

export async function GET(_: Request, { params }: { params: Promise<{ studentEnrollmentId: string }> }) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); const { studentEnrollmentId } = await params; if (!isUuid(studentEnrollmentId)) return Response.json({ message: "Student enrolment not found." }, { status: 404 }); try { return Response.json(await fetchAtRiskStudentDetail(requireLmsAdminClient(), studentEnrollmentId)); } catch (error) { return lmsApiError(error, "Student engagement record could not be loaded."); } }
