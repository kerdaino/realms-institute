import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { isUuid, readText } from "@/lib/lms/adminConstants";
import { recordLmsAudit } from "@/lib/lms/adminAudit";
import { requireLmsAdminClient } from "@/lib/lms/adminData";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ message: "Student not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const note = readText(body?.note);
  const noteType = readText(body?.note_type, 40) ?? "general";
  if (!note || !/^[a-z_]{2,40}$/.test(noteType)) return NextResponse.json({ message: "A valid internal note is required." }, { status: 400 });
  const supabase = requireLmsAdminClient();
  const result = await supabase.from("student_notes").insert({ student_id: id, note_type: noteType, note }).select("*").single();
  if (result.error) return NextResponse.json({ message: "Internal note could not be saved." }, { status: 500 });
  await recordLmsAudit(supabase, { action: "student_note_added", entityType: "student", entityId: id, metadata: { note_id: result.data.id, note_type: noteType } });
  return NextResponse.json({ note: result.data }, { status: 201 });
}
