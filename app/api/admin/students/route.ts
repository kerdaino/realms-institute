import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { fetchAdminStudents, requireLmsAdminClient } from "@/lib/lms/adminData";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    const search = new URL(request.url).searchParams;
    const students = await fetchAdminStudents(requireLmsAdminClient(), { search: search.get("search") ?? undefined, cohort: search.get("cohort") ?? undefined, route: search.get("route") ?? undefined, skill: search.get("skill") ?? undefined, status: search.get("status") ?? undefined, onboarding: search.get("onboarding") ?? undefined });
    return NextResponse.json({ students });
  } catch (error) {
    console.error("Admin students query failed", error);
    return NextResponse.json({ message: "Students could not be loaded." }, { status: 500 });
  }
}
