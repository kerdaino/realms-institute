import { PortalShell } from "@/components/portal/PortalShell";
import { FacultySessionRecord } from "@/components/portal/FacultySessionRecord";
import { requireRole } from "@/lib/lms/auth";
import { fetchFacilitatorSession, resolveFacilitatorSessionContext } from "@/lib/lms/facilitatorSessions";
export const dynamic = "force-dynamic";
export default async function FacilitatorSessionPage({ params }: { params: Promise<{ id: string }> }) { await requireRole("facilitator"); const { id } = await params; const context = await resolveFacilitatorSessionContext(); const record = await fetchFacilitatorSession(context, id); return <PortalShell eyebrow="Faculty Session" title={record.session.title} description="Assigned session details and class summary draft workflow"><FacultySessionRecord initialRecord={record} /></PortalShell>; }
