import { isAdminAuthenticated } from "@/lib/adminAuth";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { archiveInstitutionalAnnouncement } from "@/lib/lms/institutionalAnnouncementService.server";
import { lmsApiError } from "@/lib/lms/apiResponse";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ message: "Announcement not found." }, { status: 404 });
  try { return Response.json({ announcement: await archiveInstitutionalAnnouncement(requireLmsAdminClient(), id), message: "Announcement archived." }); }
  catch (error) { return lmsApiError(error, "Announcement could not be archived."); }
}
