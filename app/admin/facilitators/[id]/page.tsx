import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { FacilitatorRecord } from "@/components/admin/FacilitatorRecord";
import { requireAdmin } from "@/lib/adminAuth";
import { fetchAdminFacilitator, LmsAdminDataError, requireLmsAdminClient } from "@/lib/lms/adminData";

export default async function AdminFacilitatorPage({ params }: { params: Promise<{ id: string }> }) { await requireAdmin(); const { id } = await params; const record = await loadFacilitator(id); return <AdminShell title={record.facilitator.display_name} description="Facilitator profile and assigned cohort courses"><FacilitatorRecord initialRecord={record} /></AdminShell>; }
async function loadFacilitator(id: string) { try { return await fetchAdminFacilitator(requireLmsAdminClient(), id); } catch (error) { if (error instanceof LmsAdminDataError && error.status === 404) notFound(); throw error; } }
