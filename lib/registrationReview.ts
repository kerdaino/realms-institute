import type {
  AdvancedEntryStatus,
  AlumniVerificationStatus,
  ApplicantType,
  AssignedDiscipleshipRoute,
  RequestedDiscipleshipRoute,
  ScholarshipStatus,
} from "@/lib/registration";

export const applicantTypeLabels: Record<ApplicantType, string> = {
  new_student: "New Student",
  realms_alumnus: "REALMS Alumnus",
  prior_theological_education: "Prior Theological Education",
};

export const requestedRouteLabels: Record<RequestedDiscipleshipRoute, string> = {
  foundational: "Foundational",
  advanced: "Advanced",
};

export const assignedRouteLabels: Record<Exclude<AssignedDiscipleshipRoute, null>, string> = {
  foundational: "Foundational",
  advanced: "Advanced",
};

export const advancedEntryStatusLabels: Record<AdvancedEntryStatus, string> = {
  not_applicable: "Not Applicable",
  pending_alumni_verification: "Pending Alumni Verification",
  pending_screening_review: "Pending Screening Review",
  advanced_approved: "Advanced Approved",
  foundation_required: "Foundation Required",
  more_information_required: "More Information Required",
};

export const alumniVerificationStatusLabels: Record<AlumniVerificationStatus, string> = {
  not_applicable: "Not Applicable",
  pending: "Pending",
  verified: "Verified",
  not_verified: "Unable to Verify",
  more_information_required: "More Information Required",
};

export const scholarshipStatusLabels: Record<ScholarshipStatus, string> = {
  not_requested: "Not Requested",
  pending: "Pending",
  more_information_required: "More Information Required",
  approved_full: "Approved Full",
  approved_partial: "Approved Partial",
  declined: "Declined",
};

export const paymentStatusLabels: Record<string, string> = {
  success: "Paid",
  pending: "Payment Pending",
  not_paid: "Not Paid",
  underpayment: "Underpayment — Reconciliation Required",
  currency_mismatch: "Currency Mismatch — Reconciliation Required",
};

export function labelOrValue(labels: Record<string, string>, value: string | null | undefined, fallback = "Not recorded") {
  if (!value) return fallback;
  return labels[value] || value.replaceAll("_", " ");
}

export type ReviewEvent = {
  id: string;
  registration_id: string;
  event_type: string | null;
  note: string | null;
  actor: string | null;
  created_at: string;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
};
