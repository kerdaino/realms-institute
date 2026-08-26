import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid } from "@/lib/lms/adminConstants";
import { invalidAbsenceReviewDecisionMessage } from "@/lib/lms/absenceReview";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ message: "A valid absence request is required." }, { status: 400 });
  }

  return NextResponse.json({ message: invalidAbsenceReviewDecisionMessage }, { status: 400 });
}
