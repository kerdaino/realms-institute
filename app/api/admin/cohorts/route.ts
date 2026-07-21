import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { fetchAdminCohorts, requireLmsAdminClient } from "@/lib/lms/adminData";
export async function GET() { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); try { return NextResponse.json({ cohorts: await fetchAdminCohorts(requireLmsAdminClient()) }); } catch { return NextResponse.json({ message: "Cohorts could not be loaded." }, { status: 500 }); } }
