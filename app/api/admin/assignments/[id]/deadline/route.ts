import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { requireLmsAdminClient } from "@/lib/lms/adminData";
import { extendAssignmentDeadline } from "@/lib/lms/assessmentService";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const [{ id }, body] = await Promise.all([params, readJsonObject(request)]);
  if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid deadline extension request is required." }, { status: 400 });
  try { return NextResponse.json({ assignment: await extendAssignmentDeadline(requireLmsAdminClient(), id, body, { actorLabel: "REALMS Admin" }) }); }
  catch (error) { return lmsApiError(error, "The assignment deadline could not be extended."); }
}
