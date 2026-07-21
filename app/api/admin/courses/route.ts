import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { fetchAdminCourses, requireLmsAdminClient } from "@/lib/lms/adminData";
export async function GET() { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); try { return NextResponse.json({ courses: await fetchAdminCourses(requireLmsAdminClient()) }); } catch { return NextResponse.json({ message: "Courses could not be loaded." }, { status: 500 }); } }
