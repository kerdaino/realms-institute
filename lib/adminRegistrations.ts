import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isApplicationStatus, type ApplicationStatus } from "@/lib/applicationStatus";
import { learningModes, skillPathways } from "@/lib/constants";
import {
  advancedEntryStatuses,
  applicantTypes,
  assignedDiscipleshipRoutes,
  fundingRoutes,
  requestedDiscipleshipRoutes,
  scholarshipStatuses,
  type AdvancedEntryStatus,
  type AlumniVerificationStatus,
  type ApplicantType,
  type AssignedDiscipleshipRoute,
  type FundingRoute,
  type RequestedDiscipleshipRoute,
  type ScholarshipStatus,
  type ScreeningStatus,
} from "@/lib/registration";

const sharedRegistrationFields = "id, created_at, full_name, email, whatsapp, country, city, gender, age_range, church, learning_mode, skill_pathway, reason, referral_source, consent, fee_policy_consent, computer_access_confirmed, amount, amount_paid, payment_expected_amount, currency, public_fee_display, amount_display, exchange_note, payment_reference, payment_status, financial_requirement_status, application_status, applicant_type, requested_discipleship_route, assigned_discipleship_route, advanced_entry_status, alumni_verification_status, alumni_previous_cohort, alumni_previous_email, alumni_previous_phone, alumni_student_id, screening_status, screening_answers, funding_route, scholarship_status, admin_note, reviewed_at, reviewed_by, paid_at, confirmation_email_sent, confirmation_email_sent_at, admin_email_sent, admin_email_sent_at, admission_email_sent, admission_email_sent_at";

export const adminRegistrationListFields = sharedRegistrationFields;
export const adminRegistrationFields = `${sharedRegistrationFields}, alumni_review_note, alumni_reviewed_at, alumni_reviewed_by, theological_institution, theological_programme, theological_duration, theological_year_completed, theological_qualification, screening_objective_score, screening_objective_max, screening_short_answer_1_score, screening_short_answer_2_score, screening_short_answer_score, screening_total_score, screening_percentage, screening_review_note, screening_reviewed_at, screening_reviewed_by, advanced_entry_applicant_message, advanced_entry_decision_email_sent, advanced_entry_decision_email_sent_at, advanced_entry_decision_email_type, advanced_entry_decision_email_error, advanced_entry_decision_email_last_attempted_at, advanced_entry_decision_email_last_attempt_type, scholarship_reason, scholarship_financial_situation, scholarship_can_contribute, scholarship_contribution_amount, scholarship_approved_amount, scholarship_applicant_message, scholarship_review_note, scholarship_reviewed_at, scholarship_reviewed_by, scholarship_confirmation_email_sent, scholarship_confirmation_email_sent_at, scholarship_admin_email_sent, scholarship_admin_email_sent_at, scholarship_decision_email_sent, scholarship_decision_email_sent_at, scholarship_decision_email_type, scholarship_decision_email_error, scholarship_decision_email_last_attempted_at, admin_note_updated_at, admin_note_updated_by`;

export type AdminRegistration = {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  whatsapp: string;
  country: string;
  city: string;
  gender: string;
  age_range: string;
  church: string | null;
  learning_mode: string;
  skill_pathway: string;
  reason: string;
  referral_source: string;
  consent: boolean;
  fee_policy_consent: boolean;
  computer_access_confirmed: boolean;
  amount: number;
  amount_paid: number | null;
  payment_expected_amount: number | null;
  currency: string;
  public_fee_display: string | null;
  amount_display: string | null;
  exchange_note: string | null;
  payment_reference: string | null;
  payment_status: string;
  financial_requirement_status: string;
  application_status: ApplicationStatus;
  applicant_type: ApplicantType;
  requested_discipleship_route: RequestedDiscipleshipRoute;
  assigned_discipleship_route: AssignedDiscipleshipRoute;
  advanced_entry_status: AdvancedEntryStatus;
  alumni_verification_status: AlumniVerificationStatus;
  screening_status: ScreeningStatus;
  funding_route: FundingRoute;
  scholarship_status: ScholarshipStatus;
  alumni_previous_cohort: string | null;
  alumni_previous_email: string | null;
  alumni_previous_phone: string | null;
  alumni_student_id: string | null;
  alumni_review_note?: string | null;
  alumni_reviewed_at?: string | null;
  alumni_reviewed_by?: string | null;
  theological_institution?: string | null;
  theological_programme?: string | null;
  theological_duration?: string | null;
  theological_year_completed?: string | null;
  theological_qualification?: string | null;
  screening_answers: Record<string, unknown>;
  screening_objective_score?: number | null;
  screening_objective_max?: number | null;
  screening_short_answer_1_score?: number | null;
  screening_short_answer_2_score?: number | null;
  screening_short_answer_score?: number | null;
  screening_total_score?: number | null;
  screening_percentage?: number | null;
  screening_review_note?: string | null;
  screening_reviewed_at?: string | null;
  screening_reviewed_by?: string | null;
  advanced_entry_applicant_message?: string | null;
  advanced_entry_decision_email_sent?: boolean;
  advanced_entry_decision_email_sent_at?: string | null;
  advanced_entry_decision_email_type?: string | null;
  advanced_entry_decision_email_error?: string | null;
  advanced_entry_decision_email_last_attempted_at?: string | null;
  advanced_entry_decision_email_last_attempt_type?: string | null;
  scholarship_reason?: string | null;
  scholarship_financial_situation?: string | null;
  scholarship_can_contribute?: boolean | null;
  scholarship_contribution_amount?: number | null;
  scholarship_approved_amount?: number | null;
  scholarship_applicant_message?: string | null;
  scholarship_review_note?: string | null;
  scholarship_reviewed_at?: string | null;
  scholarship_reviewed_by?: string | null;
  scholarship_confirmation_email_sent?: boolean;
  scholarship_confirmation_email_sent_at?: string | null;
  scholarship_admin_email_sent?: boolean;
  scholarship_admin_email_sent_at?: string | null;
  scholarship_decision_email_sent?: boolean;
  scholarship_decision_email_sent_at?: string | null;
  scholarship_decision_email_type?: string | null;
  scholarship_decision_email_error?: string | null;
  scholarship_decision_email_last_attempted_at?: string | null;
  admin_note: string | null;
  admin_note_updated_at?: string | null;
  admin_note_updated_by?: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  paid_at: string | null;
  confirmation_email_sent: boolean;
  confirmation_email_sent_at: string | null;
  admin_email_sent: boolean;
  admin_email_sent_at: string | null;
  admission_email_sent: boolean;
  admission_email_sent_at: string | null;
};

export type RegistrationSummary = {
  total: number;
  paid: number;
  physical: number;
  online: number;
  webDevelopment: number;
  cybersecurity: number;
  nigerian: number;
  international: number;
  pendingReview: number;
  pendingApplications: number;
  pendingAlumniVerification: number;
  pendingScreeningReviews: number;
  pendingScholarshipRequests: number;
  advancedRouteApproved: number;
  foundationRequired: number;
  admitted: number;
  contacted: number;
  waitlisted: number;
  notAdmitted: number;
};

export type RegistrationFilters = {
  search?: string;
  learningMode?: string;
  skillPathway?: string;
  country?: string;
  paymentStatus?: string;
  applicationStatus?: string;
  applicantType?: string;
  requestedRoute?: string;
  assignedRoute?: string;
  advancedEntryStatus?: string;
  scholarshipStatus?: string;
  fundingRoute?: string;
  from?: string;
  to?: string;
};

export function readRegistrationFilters(searchParams: URLSearchParams): RegistrationFilters {
  const value = (key: string) => searchParams.get(key)?.trim().slice(0, 160) || undefined;
  return {
    search: value("search"),
    learningMode: value("learningMode"),
    skillPathway: value("skillPathway"),
    country: value("country"),
    paymentStatus: value("paymentStatus"),
    applicationStatus: value("applicationStatus"),
    applicantType: value("applicantType"),
    requestedRoute: value("requestedRoute"),
    assignedRoute: value("assignedRoute"),
    advancedEntryStatus: value("advancedEntryStatus"),
    scholarshipStatus: value("scholarshipStatus"),
    fundingRoute: value("fundingRoute"),
    from: value("from"),
    to: value("to"),
  };
}

function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) ? null : value;
}

export async function fetchAdminRegistrations(supabase: SupabaseClient, filters: RegistrationFilters) {
  let query = supabase.from("registrations").select(adminRegistrationListFields).order("created_at", { ascending: false }).limit(5000);
  const search = filters.search?.replace(/[^\p{L}\p{N}@+._\-\s]/gu, "").trim();
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,whatsapp.ilike.%${search}%`);
  if ((learningModes as readonly string[]).includes(filters.learningMode ?? "")) query = query.eq("learning_mode", filters.learningMode!);
  if ((skillPathways as readonly string[]).includes(filters.skillPathway ?? "")) query = query.eq("skill_pathway", filters.skillPathway!);
  if (filters.country && /^[\p{L}\s.'-]{2,80}$/u.test(filters.country)) query = query.ilike("country", filters.country);
  if (filters.paymentStatus && /^[a-z_-]{2,30}$/i.test(filters.paymentStatus)) query = query.eq("payment_status", filters.paymentStatus);
  if (isApplicationStatus(filters.applicationStatus ?? "")) query = query.eq("application_status", filters.applicationStatus!);
  if ((applicantTypes as readonly string[]).includes(filters.applicantType ?? "")) query = query.eq("applicant_type", filters.applicantType!);
  if ((requestedDiscipleshipRoutes as readonly string[]).includes(filters.requestedRoute ?? "")) query = query.eq("requested_discipleship_route", filters.requestedRoute!);
  if (filters.assignedRoute === "unassigned") query = query.is("assigned_discipleship_route", null);
  else if ((assignedDiscipleshipRoutes as readonly string[]).includes(filters.assignedRoute ?? "")) query = query.eq("assigned_discipleship_route", filters.assignedRoute!);
  if ((advancedEntryStatuses as readonly string[]).includes(filters.advancedEntryStatus ?? "")) query = query.eq("advanced_entry_status", filters.advancedEntryStatus!);
  if ((scholarshipStatuses as readonly string[]).includes(filters.scholarshipStatus ?? "")) query = query.eq("scholarship_status", filters.scholarshipStatus!);
  if ((fundingRoutes as readonly string[]).includes(filters.fundingRoute ?? "")) query = query.eq("funding_route", filters.fundingRoute!);
  const from = validDate(filters.from);
  const to = validDate(filters.to);
  if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
  if (to) query = query.lt("created_at", `${to}T23:59:59.999Z`);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load registrations: ${error.message}`);
  return (data ?? []) as AdminRegistration[];
}

export function summarizeRegistrations(registrations: AdminRegistration[]): RegistrationSummary {
  return registrations.reduce((summary, registration) => {
    summary.total += 1;
    if (registration.payment_status === "success") summary.paid += 1;
    if (registration.learning_mode === "Physical") summary.physical += 1;
    if (registration.learning_mode === "Online") summary.online += 1;
    if (registration.skill_pathway === "Web Development") summary.webDevelopment += 1;
    if (registration.skill_pathway === "Cybersecurity Foundations") summary.cybersecurity += 1;
    if (registration.country.trim().toLowerCase() === "nigeria") summary.nigerian += 1; else summary.international += 1;
    if (registration.application_status === "pending_review") {
      summary.pendingReview += 1;
      summary.pendingApplications += 1;
    }
    if (registration.application_status === "admitted") summary.admitted += 1;
    if (registration.application_status === "contacted") summary.contacted += 1;
    if (registration.application_status === "waitlisted") summary.waitlisted += 1;
    if (registration.application_status === "not_admitted") summary.notAdmitted += 1;
    if (registration.advanced_entry_status === "pending_alumni_verification") summary.pendingAlumniVerification += 1;
    if (registration.advanced_entry_status === "pending_screening_review") summary.pendingScreeningReviews += 1;
    if (registration.scholarship_status === "pending") summary.pendingScholarshipRequests += 1;
    if (registration.advanced_entry_status === "advanced_approved") summary.advancedRouteApproved += 1;
    if (registration.advanced_entry_status === "foundation_required") summary.foundationRequired += 1;
    return summary;
  }, {
    total: 0,
    paid: 0,
    physical: 0,
    online: 0,
    webDevelopment: 0,
    cybersecurity: 0,
    nigerian: 0,
    international: 0,
    pendingReview: 0,
    pendingApplications: 0,
    pendingAlumniVerification: 0,
    pendingScreeningReviews: 0,
    pendingScholarshipRequests: 0,
    advancedRouteApproved: 0,
    foundationRequired: 0,
    admitted: 0,
    contacted: 0,
    waitlisted: 0,
    notAdmitted: 0,
  });
}
