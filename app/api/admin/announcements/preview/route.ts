import { isAdminAuthenticated } from "@/lib/adminAuth";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { previewInstitutionalAnnouncement } from "@/lib/lms/institutionalAnnouncementService.server";
import { lmsApiError } from "@/lib/lms/apiResponse";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ message: "Announcement targeting details are required." }, { status: 400 });
  try { return Response.json(await previewInstitutionalAnnouncement(requireLmsAdminClient(), body as Record<string, unknown>)); }
  catch (error) { return lmsApiError(error, "Announcement recipients could not be previewed."); }
}
