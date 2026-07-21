export const appRoles = ["student", "facilitator", "mentor", "admin", "alumni"] as const;
export type AppRole = (typeof appRoles)[number];

export type Profile = {
  id: string;
  full_name: string | null;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  account_status: string;
  created_at: string;
  updated_at: string;
};

export type Student = {
  id: string;
  profile_id: string | null;
  registration_id: string | null;
  student_number: string;
  legal_name: string;
  preferred_name: string | null;
  email: string;
  phone: string | null;
  country: string | null;
  city: string | null;
  identity_verification_status: string;
  student_status: string;
  onboarding_status: string;
  orientation_completed_at: string | null;
  matriculated_at: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  internal_admin_note: string | null;
  created_at: string;
  updated_at: string;
};

export type Cohort = {
  id: string;
  code: string;
  name: string;
  school: string | null;
  programme: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  maximum_capacity: number | null;
  academic_year: string | null;
  application_open_date: string | null;
  application_close_date: string | null;
  orientation_date: string | null;
  matriculation_date: string | null;
  graduation_date: string | null;
  description: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Course = {
  id: string;
  code: string;
  title: string;
  course_category: string;
  discipleship_route: string | null;
  skill_pathway: string | null;
  sequence_number: number | null;
  active: boolean;
  description: string | null;
  course_purpose: string | null;
  delivery_week: string | null;
  default_schedule_text: string | null;
  learning_outcomes: unknown[];
  assessed_evidence: unknown[];
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CohortCourse = {
  id: string;
  cohort_id: string;
  course_id: string;
  delivery_mode: string | null;
  schedule_text: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type StudentEnrollment = {
  id: string;
  student_id: string;
  cohort_id: string;
  discipleship_route: "foundational" | "advanced";
  skill_pathway: "web_development" | "cybersecurity_foundations";
  skill_learning_mode: "physical" | "online" | null;
  enrolment_status: string;
  enrolled_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CourseEnrollment = {
  id: string;
  student_enrollment_id: string;
  cohort_course_id: string;
  enrollment_status: string;
  enrolled_at: string;
  completed_at: string | null;
  created_at: string;
  delivery_route: import("@/lib/lms/attendance").DeliveryRoute;
  delivery_route_status: string;
  delivery_route_note: string | null;
};

export type SessionAttendance = {
  id: string;
  course_enrollment_id: string;
  class_session_id: string;
  assigned_delivery_route: import("@/lib/lms/attendance").DeliveryRoute;
  attendance_status: import("@/lib/lms/attendance").AttendanceStatus;
  absence_weight: number;
  first_roll_call: string | null;
  first_roll_marked_at: string | null;
  first_roll_marked_by: string | null;
  second_roll_call: string | null;
  second_roll_marked_at: string | null;
  second_roll_marked_by: string | null;
  actual_joined_at: string | null;
  actual_left_at: string | null;
  online_duration_minutes: number | null;
  attendance_percentage: number | null;
  identity_verified: boolean;
  engagement_checks_expected: number;
  engagement_checks_completed: number;
  connection_issue_reported: boolean;
  online_evidence: Record<string, unknown>;
  manual_override: boolean;
  finalized_at: string | null;
  finalized_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Facilitator = {
  id: string;
  profile_id: string | null;
  display_name: string;
  email: string | null;
  phone: string | null;
  bio: string | null;
  title: string | null;
  facilitator_status: string;
  internal_notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type StudentNote = {
  id: string;
  student_id: string;
  note_type: string;
  note: string;
  created_by: string | null;
  created_at: string;
};

export type FacilitatorCourseAssignment = {
  id: string;
  facilitator_id: string;
  cohort_course_id: string;
  assignment_role: string;
  created_at: string;
};

export type ClassSession = {
  id: string;
  cohort_course_id: string;
  title: string;
  description: string | null;
  session_number: number | null;
  session_type: string;
  delivery_mode: string;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  timezone: string;
  actual_start_at: string | null;
  actual_end_at: string | null;
  live_join_url: string | null;
  physical_location: string | null;
  session_status: string;
  is_required: boolean;
  visibility_status: string;
  facilitator_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ClassSummary = {
  id: string;
  class_session_id: string;
  title: string | null;
  learning_objectives: unknown[];
  key_teaching_points: unknown[];
  key_scriptures_references: unknown[];
  important_concepts: unknown[];
  practical_applications: unknown[];
  action_points: unknown[];
  recommended_resources: unknown[];
  additional_notes: string | null;
  summary_status: string;
  version_number: number;
  published_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionResource = {
  id: string;
  class_session_id: string;
  title: string;
  description: string | null;
  resource_type: string;
  external_url: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  access_level: string;
  sort_order: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ClassRecording = {
  id: string;
  class_session_id: string;
  title: string;
  provider: string | null;
  external_url: string | null;
  embed_url: string | null;
  external_recording_id: string | null;
  duration_seconds: number | null;
  recording_status: string;
  access_level: string;
  retention_status: string;
  available_from: string | null;
  available_until: string | null;
  quality_checked: boolean;
  quality_checked_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Alumni = {
  id: string;
  student_id: string;
  alumni_since: string | null;
  learning_archive_access: boolean | null;
  alumni_status: string | null;
  alumni_number: string | null;
  first_graduated_at: string | null;
  created_at: string;
  updated_at: string;
};
