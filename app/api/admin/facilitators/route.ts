import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { fetchAdminFacilitators, requireLmsAdminClient } from "@/lib/lms/adminData";
export async function GET() { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); try { return NextResponse.json({ facilitators: await fetchAdminFacilitators(requireLmsAdminClient()) }); } catch { return NextResponse.json({ message: "Facilitators could not be loaded." }, { status: 500 }); } }
