import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { changeCourseDeliveryRoute } from "@/lib/lms/attendanceService";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { initializeRecordedLearningForCourseEnrollment } from "@/lib/lms/recordingService";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params; const body = await readJsonObject(request);
  if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid delivery-route change is required." }, { status: 400 });
  try {
    const supabase = requireLmsAdminClient();
    const courseEnrollment = await changeCourseDeliveryRoute(supabase, id, body, { actorLabel: "REALMS Admin" });
    const recordedLearning = ["RP", "DR-E"].includes(String(courseEnrollment.delivery_route))
      ? await initializeRecordedLearningForCourseEnrollment(supabase, id, { actorLabel: "REALMS Admin" })
      : null;
    return NextResponse.json({ courseEnrollment, recordedLearning });
  }
  catch (error) { return lmsApiError(error, "Delivery route could not be changed."); }
}
