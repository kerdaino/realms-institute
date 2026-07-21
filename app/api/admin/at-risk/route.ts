import { isAdminAuthenticated } from "@/lib/adminAuth";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { lmsApiError } from "@/lib/lms/apiResponse";
import { fetchAtRiskDashboard } from "@/lib/lms/engagementData";

export async function GET(request: Request) { if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 }); try { const params = new URL(request.url).searchParams; return Response.json(await fetchAtRiskDashboard(requireLmsAdminClient(), { cohort: params.get("cohort") ?? undefined, student: params.get("student") ?? undefined, route: params.get("route") ?? undefined, skill: params.get("skill") ?? undefined, standing: params.get("standing") ?? undefined, alertType: params.get("alert_type") ?? undefined, severity: params.get("severity") ?? undefined, mentor: params.get("mentor") ?? undefined, recovery: params.get("recovery") ?? undefined, course: params.get("course") ?? undefined })); } catch (error) { return lmsApiError(error, "Student engagement records could not be loaded."); } }
