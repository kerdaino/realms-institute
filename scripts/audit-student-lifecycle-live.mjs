import assert from "node:assert/strict";

import { createClient } from "@supabase/supabase-js";

import { deriveStudentLifecycle } from "../lib/lms/studentLifecycle.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase environment variables are required.");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const students = await supabase
  .from("students")
  .select("id, student_status, onboarding_status, orientation_completed_at, matriculated_at, profiles(account_status), student_enrollments(enrolment_status, enrolled_at)")
  .eq("student_status", "active")
  .eq("onboarding_status", "completed")
  .not("orientation_completed_at", "is", null)
  .not("matriculated_at", "is", null);

if (students.error) throw new Error(`Lifecycle audit could not load student states: ${students.error.message}`);

const candidates = (students.data ?? []).flatMap((student) => {
  const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;
  const enrollments = [...(student.student_enrollments ?? [])].sort((a, b) => Date.parse(b.enrolled_at) - Date.parse(a.enrolled_at));
  const enrollment = enrollments.find((item) => item.enrolment_status === "pending_onboarding");
  if (!enrollment || profile?.account_status !== "active") return [];
  return [deriveStudentLifecycle({
    studentStatus: student.student_status,
    enrollmentStatus: enrollment.enrolment_status,
    onboardingStatus: student.onboarding_status,
    orientationCompletedAt: student.orientation_completed_at,
    matriculatedAt: student.matriculated_at,
    portalAccountStatus: profile.account_status,
  })];
});

assert.ok(candidates.length > 0, "No active completed-onboarding student with a pending-onboarding enrollment was found.");
assert.ok(candidates.every((lifecycle) => lifecycle.academicStatus === "Active Student"));
assert.ok(candidates.every((lifecycle) => lifecycle.overallOnboarding === "Completed"));

console.log(JSON.stringify({
  matchingStudentCount: candidates.length,
  academicStatus: "Active Student",
  overallOnboarding: "Completed",
  pendingOnboardingContradictions: candidates.filter((item) => /Pending Onboarding|Onboarding Pending/.test(item.academicStatus)).length,
  readOnly: true,
}, null, 2));
