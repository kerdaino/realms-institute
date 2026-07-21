import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { provisionStudentFromRegistration, StudentProvisioningError } from "@/lib/lms/provisionStudent";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Registration not found." }, { status: 404 });

  let cohortId: string | undefined;
  const text = await request.text();
  if (text) {
    try {
      const body = JSON.parse(text) as Record<string, unknown>;
      if (typeof body.cohortId === "string" && body.cohortId.trim()) cohortId = body.cohortId.trim();
    } catch {
      return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
    }
  }
  if (cohortId && !/^[0-9a-f-]{36}$/i.test(cohortId)) return NextResponse.json({ message: "A valid cohort ID is required." }, { status: 400 });

  try {
    const result = await provisionStudentFromRegistration({ registrationId: id, cohortId });
    return NextResponse.json({
      student_number: result.student.student_number,
      student_id: result.student.id,
      auth_user_id: result.authUserId,
      auth_status: result.authUserStatus,
      profile_status: result.profileStatus,
      role_status: result.roleStatus,
      cohort: result.cohort,
      course_enrollment_count: result.courseEnrollmentCount,
    });
  } catch (error) {
    if (error instanceof StudentProvisioningError) return NextResponse.json({ message: error.message }, { status: error.status });
    console.error("Student provisioning failed", error instanceof Error ? { name: error.name, message: error.message } : { name: "UnknownError" });
    return NextResponse.json({ message: "The student account could not be provisioned." }, { status: 500 });
  }
}
