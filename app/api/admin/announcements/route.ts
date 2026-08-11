import { isAdminAuthenticated } from "@/lib/adminAuth";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { createInstitutionalAnnouncement, fetchAdminInstitutionalAnnouncements } from "@/lib/lms/institutionalAnnouncementService.server";
import { lmsApiError } from "@/lib/lms/apiResponse";

export async function GET() {
  if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 });
  try { return Response.json({ announcements: await fetchAdminInstitutionalAnnouncements(requireLmsAdminClient()) }); }
  catch (error) { return lmsApiError(error, "Announcements could not be loaded."); }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ message: "Announcement details are required." }, { status: 400 });
  try {
    const result = await createInstitutionalAnnouncement(requireLmsAdminClient(), body as Record<string, unknown>);
    return Response.json({ ...result, message: result.announcement.announcement_status === "published" ? "Announcement published." : "Announcement saved as draft." });
  } catch (error) { return lmsApiError(error, "Announcement could not be saved."); }
}
