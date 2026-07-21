import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { Cohort, Student, StudentEnrollment } from "@/lib/lms/types";
import {
  advancedDiscipleshipCourses,
  cybersecurityCourses,
  foundationalDiscipleshipCourses,
  webDevelopmentCourses,
} from "@/lib/schoolOfDiscoveryCurriculum";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const currentCohortCode = "RSD-AUG-2026";
const registrationSelect = "id, application_status, assigned_discipleship_route, skill_pathway, learning_mode, full_name, email, whatsapp, country, city";
const studentSelect = "id, profile_id, registration_id, student_number, legal_name, preferred_name, email, phone, country, city, identity_verification_status, student_status, onboarding_status, orientation_completed_at, matriculated_at, emergency_contact_name, emergency_contact_phone, internal_admin_note, created_at, updated_at";
const enrollmentSelect = "id, student_id, cohort_id, discipleship_route, skill_pathway, skill_learning_mode, enrolment_status, enrolled_at, completed_at, created_at, updated_at";

type ProvisionableRegistration = {
  id: string;
  application_status: string;
  assigned_discipleship_route: string | null;
  skill_pathway: string;
  learning_mode: string;
  full_name: string;
  email: string;
  whatsapp: string;
  country: string;
  city: string;
};

type NormalizedSkill = {
  value: "web_development" | "cybersecurity_foundations";
  courseCodes: string[];
};

export class StudentProvisioningError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "StudentProvisioningError";
  }
}

export type StudentProvisioningResult = {
  student: Student;
  studentEnrollment: StudentEnrollment;
  courseEnrollmentCount: number;
  authUserId: string;
  authUserStatus: "created" | "existing";
  profileStatus: "created" | "updated";
  roleStatus: "assigned";
  cohort: Pick<Cohort, "id" | "code" | "name">;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeSkillPathway(value: string): NormalizedSkill | null {
  if (value === "Web Development") {
    return { value: "web_development", courseCodes: webDevelopmentCourses.map((course) => course.code) };
  }
  if (value === "Cybersecurity Foundations") {
    return { value: "cybersecurity_foundations", courseCodes: cybersecurityCourses.map((course) => course.code) };
  }
  return null;
}

function normalizeLearningMode(value: string) {
  if (value === "Physical") return "physical" as const;
  if (value === "Online") return "online" as const;
  return null;
}

async function findAuthUserByEmail(supabase: SupabaseClient, email: string): Promise<User | null> {
  const perPage = 200;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new StudentProvisioningError("The institutional Auth directory could not be checked.", 503);
    const user = data.users.find((candidate) => normalizeEmail(candidate.email || "") === email);
    if (user) return user;
    if (data.users.length < perPage) return null;
  }
  throw new StudentProvisioningError("The institutional Auth directory is too large to search safely.", 503);
}

async function findOrCreateAuthUser(supabase: SupabaseClient, registration: ProvisionableRegistration) {
  const email = normalizeEmail(registration.email);
  const existing = await findAuthUserByEmail(supabase, email);
  if (existing) return { user: existing, status: "existing" as const };

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: { full_name: registration.full_name },
  });
  if (!error && data.user) return { user: data.user, status: "created" as const };

  // A concurrent provisioning request may have created the same Auth user.
  const racedUser = await findAuthUserByEmail(supabase, email);
  if (racedUser) return { user: racedUser, status: "existing" as const };
  throw new StudentProvisioningError("The institutional Auth account could not be prepared.", 503);
}

async function loadRegistration(supabase: SupabaseClient, registrationId: string) {
  const { data, error } = await supabase.from("registrations").select(registrationSelect).eq("id", registrationId).maybeSingle();
  if (error) throw new StudentProvisioningError("The admitted registration could not be loaded.", 500);
  if (!data) throw new StudentProvisioningError("Registration not found.", 404);
  return data as ProvisionableRegistration;
}

async function loadCohort(supabase: SupabaseClient, cohortId?: string) {
  let query = supabase.from("cohorts").select("id, code, name");
  query = cohortId ? query.eq("id", cohortId) : query.eq("code", currentCohortCode);
  const { data, error } = await query.maybeSingle();
  if (error) throw new StudentProvisioningError("The cohort could not be loaded.", 500);
  if (!data) throw new StudentProvisioningError("The requested cohort was not found.", 404);
  return data as Pick<Cohort, "id" | "code" | "name">;
}

async function upsertProfile(supabase: SupabaseClient, authUserId: string, registration: ProvisionableRegistration) {
  const { data: existing, error: lookupError } = await supabase.from("profiles").select("id").eq("id", authUserId).maybeSingle();
  if (lookupError) throw new StudentProvisioningError("The institutional profile could not be checked.", 500);
  const now = new Date().toISOString();
  const { error } = await supabase.from("profiles").upsert({
    id: authUserId,
    full_name: registration.full_name,
    email: normalizeEmail(registration.email),
    phone: registration.whatsapp,
    account_status: "active",
    updated_at: now,
  }, { onConflict: "id" });
  if (error) throw new StudentProvisioningError("The institutional profile could not be saved.", 500);
  return existing ? "updated" as const : "created" as const;
}

async function assignStudentRole(supabase: SupabaseClient, authUserId: string) {
  const { data: role, error: roleError } = await supabase.from("roles").select("id").eq("name", "student").maybeSingle();
  if (roleError || !role) throw new StudentProvisioningError("The student role is not configured.", 500);
  const { error } = await supabase.from("user_roles").upsert({ user_id: authUserId, role_id: role.id }, { onConflict: "user_id,role_id", ignoreDuplicates: true });
  if (error) throw new StudentProvisioningError("The student role could not be assigned.", 500);
}

async function findStudent(supabase: SupabaseClient, registrationId: string, profileId: string) {
  const byRegistration = await supabase.from("students").select(studentSelect).eq("registration_id", registrationId).maybeSingle();
  if (byRegistration.error) throw new StudentProvisioningError("The student record could not be checked.", 500);
  if (byRegistration.data) {
    if (byRegistration.data.profile_id && byRegistration.data.profile_id !== profileId) throw new StudentProvisioningError("This registration is already linked to another institutional profile.", 409);
    return byRegistration.data as Student;
  }

  const byProfile = await supabase.from("students").select(studentSelect).eq("profile_id", profileId).maybeSingle();
  if (byProfile.error) throw new StudentProvisioningError("The student record could not be checked.", 500);
  if (byProfile.data?.registration_id && byProfile.data.registration_id !== registrationId) {
    throw new StudentProvisioningError("This institutional profile is already linked to another student registration. Manual review is required.", 409);
  }
  return byProfile.data as Student | null;
}

async function createOrUpdateStudent(supabase: SupabaseClient, authUserId: string, registration: ProvisionableRegistration) {
  const existing = await findStudent(supabase, registration.id, authUserId);
  const identity = {
    profile_id: authUserId,
    registration_id: registration.id,
    legal_name: registration.full_name,
    email: normalizeEmail(registration.email),
    phone: registration.whatsapp,
    country: registration.country,
    city: registration.city,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await supabase.from("students").update(identity).eq("id", existing.id).select(studentSelect).single();
    if (error || !data) throw new StudentProvisioningError("The student master record could not be updated.", 500);
    return data as Student;
  }

  const { data, error } = await supabase.from("students").insert(identity).select(studentSelect).single();
  if (!error && data) return data as Student;

  const racedStudent = await findStudent(supabase, registration.id, authUserId);
  if (racedStudent) return racedStudent;
  throw new StudentProvisioningError("The student master record could not be created.", 500);
}

async function createOrLoadStudentEnrollment(supabase: SupabaseClient, input: {
  studentId: string;
  cohortId: string;
  discipleshipRoute: "foundational" | "advanced";
  skillPathway: NormalizedSkill["value"];
  skillLearningMode: "physical" | "online";
}) {
  const existingResult = await supabase.from("student_enrollments").select(enrollmentSelect).eq("student_id", input.studentId).eq("cohort_id", input.cohortId).maybeSingle();
  if (existingResult.error) throw new StudentProvisioningError("The student cohort enrolment could not be checked.", 500);
  const existing = existingResult.data as StudentEnrollment | null;
  if (existing) {
    if (existing.discipleship_route !== input.discipleshipRoute || existing.skill_pathway !== input.skillPathway || existing.skill_learning_mode !== input.skillLearningMode) {
      throw new StudentProvisioningError("The existing cohort enrolment does not match this registration. Manual academic review is required.", 409);
    }
    return existing;
  }

  const { data, error } = await supabase.from("student_enrollments").insert({
    student_id: input.studentId,
    cohort_id: input.cohortId,
    discipleship_route: input.discipleshipRoute,
    skill_pathway: input.skillPathway,
    skill_learning_mode: input.skillLearningMode,
  }).select(enrollmentSelect).single();
  if (!error && data) return data as StudentEnrollment;

  const raced = await supabase.from("student_enrollments").select(enrollmentSelect).eq("student_id", input.studentId).eq("cohort_id", input.cohortId).maybeSingle();
  if (raced.data) return raced.data as StudentEnrollment;
  throw new StudentProvisioningError("The student cohort enrolment could not be created.", 500);
}

async function enrollRequiredCourses(supabase: SupabaseClient, studentEnrollmentId: string, cohortId: string, requiredCodes: string[], skillLearningMode: "physical" | "online") {
  const { data: courses, error: courseError } = await supabase.from("courses").select("id, code, course_category").in("code", requiredCodes).eq("active", true);
  if (courseError) throw new StudentProvisioningError("The required course catalogue could not be loaded.", 500);
  if (!courses || courses.length !== requiredCodes.length) throw new StudentProvisioningError("The cohort course catalogue is incomplete for this approved route and skill pathway.", 409);

  const courseIds = courses.map((course) => course.id);
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const { data: cohortCourses, error: cohortCourseError } = await supabase.from("cohort_courses").select("id, course_id").eq("cohort_id", cohortId).in("course_id", courseIds);
  if (cohortCourseError) throw new StudentProvisioningError("The cohort course offerings could not be loaded.", 500);
  if (!cohortCourses || cohortCourses.length !== requiredCodes.length) throw new StudentProvisioningError("The August 2026 cohort is missing one or more required course offerings.", 409);

  const rows = cohortCourses.map((cohortCourse) => ({
    student_enrollment_id: studentEnrollmentId,
    cohort_course_id: cohortCourse.id,
    enrollment_status: "active",
    delivery_route: courseById.get(cohortCourse.course_id)?.course_category === "discipleship" ? "DL" : skillLearningMode === "online" ? "OL" : "PL",
    delivery_route_status: "active",
    delivery_route_note: null,
  }));
  const { error: enrollmentError } = await supabase.from("course_enrollments").upsert(rows, { onConflict: "student_enrollment_id,cohort_course_id", ignoreDuplicates: true });
  if (enrollmentError) throw new StudentProvisioningError("The required course enrolments could not be saved.", 500);

  const cohortCourseIds = cohortCourses.map((course) => course.id);
  const countResult = await supabase.from("course_enrollments").select("id", { count: "exact", head: true }).eq("student_enrollment_id", studentEnrollmentId).in("cohort_course_id", cohortCourseIds);
  if (countResult.error || countResult.count !== requiredCodes.length) throw new StudentProvisioningError("The required course enrolments could not be verified.", 500);
  return countResult.count;
}

async function recordProvisioningAudit(supabase: SupabaseClient, input: {
  registrationId: string;
  student: Student;
  cohort: Pick<Cohort, "id" | "code" | "name">;
  route: string;
  skillPathway: string;
}) {
  const existing = await supabase.from("audit_logs").select("id").eq("action", "student_account_provisioned").eq("entity_type", "student").eq("entity_id", input.student.id).contains("metadata", { registration_id: input.registrationId }).limit(1).maybeSingle();
  if (existing.error) console.error("Student provisioning audit lookup failed", { code: existing.error.code });
  if (existing.data) return;
  const { error } = await supabase.from("audit_logs").insert({
    action: "student_account_provisioned",
    entity_type: "student",
    entity_id: input.student.id,
    metadata: {
      registration_id: input.registrationId,
      student_number: input.student.student_number,
      cohort: input.cohort.code,
      route: input.route,
      skill_pathway: input.skillPathway,
    },
  });
  if (error) console.error("Student provisioning audit insert failed", { code: error.code });
}

export async function provisionStudentFromRegistration(input: { registrationId: string; cohortId?: string }): Promise<StudentProvisioningResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new StudentProvisioningError("Supabase administrative access is not configured.", 503);

  const registration = await loadRegistration(supabase, input.registrationId);
  if (registration.application_status !== "admitted") throw new StudentProvisioningError("Only an admitted registration can be provisioned.", 409);
  if (registration.assigned_discipleship_route !== "foundational" && registration.assigned_discipleship_route !== "advanced") {
    throw new StudentProvisioningError("An approved discipleship route is required before provisioning.", 409);
  }
  const skill = normalizeSkillPathway(registration.skill_pathway);
  if (!skill) throw new StudentProvisioningError("A valid approved skill pathway is required before provisioning.", 409);
  const skillLearningMode = normalizeLearningMode(registration.learning_mode);
  if (!skillLearningMode) throw new StudentProvisioningError("A valid skill-pathway learning mode is required before provisioning.", 409);

  const cohort = await loadCohort(supabase, input.cohortId);
  const auth = await findOrCreateAuthUser(supabase, registration);
  const profileStatus = await upsertProfile(supabase, auth.user.id, registration);
  await assignStudentRole(supabase, auth.user.id);
  const student = await createOrUpdateStudent(supabase, auth.user.id, registration);
  const studentEnrollment = await createOrLoadStudentEnrollment(supabase, {
    studentId: student.id,
    cohortId: cohort.id,
    discipleshipRoute: registration.assigned_discipleship_route,
    skillPathway: skill.value,
    skillLearningMode,
  });

  const discipleshipCodes = registration.assigned_discipleship_route === "foundational"
    ? foundationalDiscipleshipCourses.map((course) => course.code)
    : advancedDiscipleshipCourses.map((course) => course.code);
  const requiredCodes = [...discipleshipCodes, ...skill.courseCodes];
  const courseEnrollmentCount = await enrollRequiredCourses(supabase, studentEnrollment.id, cohort.id, requiredCodes, skillLearningMode);
  await recordProvisioningAudit(supabase, { registrationId: registration.id, student, cohort, route: registration.assigned_discipleship_route, skillPathway: skill.value });

  return {
    student,
    studentEnrollment,
    courseEnrollmentCount,
    authUserId: auth.user.id,
    authUserStatus: auth.status,
    profileStatus,
    roleStatus: "assigned",
    cohort,
  };
}
