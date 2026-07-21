import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { fetchAdminDashboard, requireLmsAdminClient } from "@/lib/lms/adminData";
export async function GET() { if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 }); try { return NextResponse.json({ summary: await fetchAdminDashboard(requireLmsAdminClient()) }); } catch (error) { console.error("Admin dashboard query failed", error); return NextResponse.json({ message: "Dashboard data could not be loaded." }, { status: 500 }); } }
