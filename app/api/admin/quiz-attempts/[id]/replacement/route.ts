import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { lmsApiError, readJsonObject } from "@/lib/lms/apiResponse";
import { grantQuizReplacementAttempt } from "@/lib/lms/assessmentService";
import { requireLmsAdminClient } from "@/lib/lms/adminData";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const [{ id }, body] = await Promise.all([params, readJsonObject(request)]);
  if (!isUuid(id) || !body) return NextResponse.json({ message: "A valid replacement-attempt request is required." }, { status: 400 });
  try {
    return NextResponse.json({
      grant: await grantQuizReplacementAttempt(requireLmsAdminClient(), id, body, { actorLabel: "REALMS Admin" }),
    });
  } catch (error) {
    return lmsApiError(error, "The replacement attempt could not be granted.");
  }
}
