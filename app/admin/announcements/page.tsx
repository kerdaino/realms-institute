import { AdminShell } from "@/components/admin/AdminShell";
import { AnnouncementsManager } from "@/components/admin/AnnouncementsManager";
import { requireAdmin } from "@/lib/adminAuth";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { fetchAdminInstitutionalAnnouncements, fetchAnnouncementAdminOptions } from "@/lib/lms/institutionalAnnouncementService.server";

export default async function AdminAnnouncementsPage() {
  await requireAdmin();
  const supabase = requireLmsAdminClient();
  const [announcements, options] = await Promise.all([fetchAdminInstitutionalAnnouncements(supabase), fetchAnnouncementAdminOptions(supabase)]);
  return <AdminShell title="Announcements" description="Create controlled institutional notices for eligible current and upcoming cohort learners and facilitators, with account-aware portal visibility and auditable email delivery."><AnnouncementsManager initialAnnouncements={announcements as never} options={options as never} /></AdminShell>;
}
