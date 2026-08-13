import { isAdminAuthenticated } from "@/lib/adminAuth";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { publishInstitutionalAnnouncement } from "@/lib/lms/institutionalAnnouncementService.server";
import { lmsApiError } from "@/lib/lms/apiResponse";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ message: "Announcement not found." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  try { return Response.json({ ...(await publishInstitutionalAnnouncement(requireLmsAdminClient(), id, body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {})), message: "Announcement published." }); }
  catch (error) { return lmsApiError(error, "Announcement could not be published."); }
}
