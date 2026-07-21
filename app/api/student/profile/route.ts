import { NextResponse } from "next/server";

import { getCurrentUser, getCurrentUserRoles } from "@/lib/lms/auth";
import { readHttpUrl, readText } from "@/lib/lms/adminConstants";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Please sign in to update your profile." }, { status: 401 });
  const roles = await getCurrentUserRoles();
  if (!roles.includes("student")) return NextResponse.json({ message: "You do not have access to update a student profile." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || Array.isArray(body)) return NextResponse.json({ message: "Valid personal profile details are required." }, { status: 400 });

  const preferredName = readText(body.preferred_name, 80);
  const phone = readText(body.phone, 40);
  const avatarUrl = body.avatar_url === null || body.avatar_url === "" ? null : readHttpUrl(body.avatar_url);
  if (body.avatar_url && avatarUrl === undefined) return NextResponse.json({ message: "Profile image URL must be a valid HTTPS link." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const studentResult = await supabase.from("students").select("id").eq("profile_id", user.id).maybeSingle();
  if (studentResult.error) {
    console.error("Student profile ownership check failed", { code: studentResult.error.code, message: studentResult.error.message });
    return NextResponse.json({ message: "Your profile could not be updated right now." }, { status: 500 });
  }
  if (!studentResult.data) return NextResponse.json({ message: "Your student account has not yet been fully activated. Please contact REALMS Institute." }, { status: 409 });

  const result = await supabase.from("profiles").update({ preferred_name: preferredName, phone, avatar_url: avatarUrl, updated_at: new Date().toISOString() }).eq("id", user.id).select("preferred_name, phone, avatar_url").maybeSingle();
  if (result.error) {
    console.error("Student personal profile update failed", { code: result.error.code, message: result.error.message });
    return NextResponse.json({ message: "Your profile could not be updated right now. Please try again or contact REALMS Institute." }, { status: 500 });
  }
  if (!result.data) return NextResponse.json({ message: "Your profile could not be updated right now." }, { status: 403 });
  return NextResponse.json({ profile: result.data, message: "Your personal profile details have been updated." });
}

