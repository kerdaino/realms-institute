import "server-only";

import { scoreFoundationalScreening, screeningObjectiveMax } from "@/lib/foundationalScreeningAnswers.server";
import { paymentReferenceMatchesApplication, type PaymentReconciliation } from "@/lib/paymentReconciliation";
import { recordPaymentVerificationEvent, type PaymentVerificationAuditStatus } from "@/lib/paymentVerificationAudit";
import type { PaystackVerificationData } from "@/lib/paystack";
import { calculateCohortFee, hasFoundationalScreeningAnswers, normalizeScreeningAnswers, type CohortFee, type RegistrationPayload, validateRegistrationPayload } from "@/lib/registration";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type RegistrationSaveResult =
  | { saved: true; id: string; registration: SavedRegistration; paymentVerificationAuditStatus: PaymentVerificationAuditStatus }
  | { saved: false; reason: string };

export class PaymentRegistrationConflictError extends Error {
  constructor() {
    super("PAYMENT_REGISTRATION_CONFLICT");
    this.name = "PaymentRegistrationConflictError";
  }
}

export type SavedRegistration = {
  id: string;
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
  application_status: string;
  applicant_type: string;
  requested_discipleship_route: string;
  assigned_discipleship_route: string | null;
  advanced_entry_status: string;
  alumni_verification_status: string;
  screening_status: string;
  screening_answers: Record<string, unknown>;
  screening_objective_score: number | null;
  screening_objective_max: number;
  screening_short_answer_score: number | null;
  screening_short_answer_max: number;
  screening_total_score: number | null;
  screening_percentage: number | null;
  funding_route: string;
  scholarship_status: string;
  scholarship_reason: string | null;
  scholarship_financial_situation: string | null;
  scholarship_can_contribute: boolean | null;
  scholarship_contribution_amount: number | null;
  scholarship_approved_amount: number | null;
  scholarship_applicant_message: string | null;
  admin_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  paid_at: string | null;
  confirmation_email_sent: boolean;
  confirmation_email_sent_at: string | null;
  admin_email_sent: boolean;
  admin_email_sent_at: string | null;
  scholarship_confirmation_email_sent: boolean;
  scholarship_confirmation_email_sent_at: string | null;
  scholarship_admin_email_sent: boolean;
  scholarship_admin_email_sent_at: string | null;
  scholarship_decision_email_sent: boolean;
  scholarship_decision_email_sent_at: string | null;
  scholarship_decision_email_type: string | null;
  scholarship_decision_email_error: string | null;
  scholarship_decision_email_last_attempted_at: string | null;
  admission_email_sent: boolean;
  admission_email_sent_at: string | null;
};

export type CalculatedFeeMetadata = {
  amount: number;
  currency: string;
  display: string;
  publicDisplay?: string;
  exchangeRate?: number;
  exchangeNote?: string;
};

export type NormalizedPaystackRegistrationMetadata =
  | { isValid: true; registration: RegistrationPayload; calculatedFee: CalculatedFeeMetadata | null; missingFields: string[]; applicationId?: string; applicationReference?: string }
  | { isValid: false; registration: null; calculatedFee: CalculatedFeeMetadata | null; missingFields: string[]; applicationId?: string; applicationReference?: string };

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readNullableString(record: Record<string, unknown>, ...keys: string[]) {
  return readString(record, ...keys) || null;
}

function readBoolean(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === true) return true;
    if (typeof value === "string" && value.trim().toLowerCase() === "true") return true;
  }
  return false;
}

function readCalculatedFee(value: unknown): CalculatedFeeMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fee = value as Record<string, unknown>;
  const amount = readNumber(fee.amount);
  if (amount === null || amount <= 0 || typeof fee.currency !== "string" || !fee.currency.trim() || typeof fee.display !== "string" || !fee.display.trim()) return null;
  const exchangeRate = readNumber(fee.exchangeRate ?? fee.exchange_rate);
  return {
    amount,
    currency: fee.currency.trim(),
    display: fee.display.trim(),
    publicDisplay: readString(fee, "publicDisplay", "public_display") || undefined,
    exchangeRate: exchangeRate ?? undefined,
    exchangeNote: readString(fee, "exchangeNote", "exchange_note") || undefined,
  };
}

function readCustomerEmail(customer: unknown) {
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) return null;
  const email = (customer as Record<string, unknown>).email;
  return typeof email === "string" && email.trim() ? email.trim() : null;
}

function publicFeeDisplay(fee: CalculatedFeeMetadata | CohortFee) {
  return "publicDisplay" in fee ? fee.publicDisplay || fee.display : fee.display;
}

function exchangeNote(fee: CalculatedFeeMetadata | CohortFee) {
  return "exchangeNote" in fee ? fee.exchangeNote ?? null : null;
}

export const savedRegistrationSelect = "id, full_name, email, whatsapp, country, city, gender, age_range, church, learning_mode, skill_pathway, reason, referral_source, fee_policy_consent, computer_access_confirmed, amount, amount_paid, payment_expected_amount, currency, public_fee_display, amount_display, exchange_note, payment_reference, payment_status, financial_requirement_status, application_status, applicant_type, requested_discipleship_route, assigned_discipleship_route, advanced_entry_status, alumni_verification_status, screening_status, screening_answers, screening_objective_score, screening_objective_max, screening_short_answer_score, screening_short_answer_max, screening_total_score, screening_percentage, funding_route, scholarship_status, scholarship_reason, scholarship_financial_situation, scholarship_can_contribute, scholarship_contribution_amount, scholarship_approved_amount, scholarship_applicant_message, admin_note, reviewed_at, reviewed_by, paid_at, confirmation_email_sent, confirmation_email_sent_at, admin_email_sent, admin_email_sent_at, scholarship_confirmation_email_sent, scholarship_confirmation_email_sent_at, scholarship_admin_email_sent, scholarship_admin_email_sent_at, scholarship_decision_email_sent, scholarship_decision_email_sent_at, scholarship_decision_email_type, scholarship_decision_email_error, scholarship_decision_email_last_attempted_at, admission_email_sent, admission_email_sent_at";

const paymentApplicationSelect = "id, full_name, email, whatsapp, country, city, gender, age_range, church, learning_mode, skill_pathway, reason, referral_source, consent, fee_policy_consent, computer_access_confirmed, applicant_type, requested_discipleship_route, assigned_discipleship_route, advanced_entry_status, alumni_verification_status, screening_status, alumni_previous_cohort, alumni_previous_email, alumni_previous_phone, alumni_student_id, theological_institution, theological_programme, theological_duration, theological_year_completed, theological_qualification, screening_answers, funding_route, scholarship_status, scholarship_reason, scholarship_financial_situation, scholarship_can_contribute, scholarship_contribution_amount, amount, currency, public_fee_display, amount_display, exchange_note, payment_reference, payment_status";

const screeningShortAnswerMax = 50;

type NormalizedScreeningFields = {
  screening_answers: Record<string, unknown>;
  screening_objective_score: number | null;
  screening_objective_max: number;
  screening_short_answer_score: number | null;
  screening_short_answer_max: number;
  screening_total_score: number | null;
  screening_percentage: number | null;
  screening_status: "not_required" | "submitted";
};

export function normalizeScreeningFields(registration: Pick<RegistrationPayload, "applicantType" | "screeningAnswers">): NormalizedScreeningFields {
  if (registration.applicantType === "prior_theological_education") {
    const screeningAnswers = normalizeScreeningAnswers(registration.applicantType, registration.screeningAnswers);
    const screeningScore = hasFoundationalScreeningAnswers(screeningAnswers) ? scoreFoundationalScreening(screeningAnswers) : null;
    return {
      screening_answers: screeningAnswers,
      screening_objective_score: screeningScore?.screeningObjectiveScore ?? null,
      screening_objective_max: screeningObjectiveMax,
      screening_short_answer_score: null,
      screening_short_answer_max: screeningShortAnswerMax,
      screening_total_score: null,
      screening_percentage: null,
      screening_status: "submitted",
    };
  }

  return {
    screening_answers: {},
    screening_objective_score: null,
    screening_objective_max: screeningObjectiveMax,
    screening_short_answer_score: null,
    screening_short_answer_max: screeningShortAnswerMax,
    screening_total_score: null,
    screening_percentage: null,
    screening_status: "not_required",
  };
}

export function buildRegistrationColumns(registration: RegistrationPayload, fee: CohortFee) {
  return {
    full_name: registration.fullName,
    email: registration.email,
    whatsapp: registration.whatsapp,
    country: registration.country,
    city: registration.city,
    gender: registration.gender,
    age_range: registration.ageRange,
    church: registration.church || null,
    learning_mode: registration.learningMode,
    skill_pathway: registration.skillPathway,
    reason: registration.reason,
    referral_source: registration.referralSource,
    consent: registration.consent,
    fee_policy_consent: registration.feePolicyConsent,
    computer_access_confirmed: registration.computerAccessConfirmed,
    applicant_type: registration.applicantType,
    requested_discipleship_route: registration.requestedDiscipleshipRoute,
    assigned_discipleship_route: registration.assignedDiscipleshipRoute,
    advanced_entry_status: registration.advancedEntryStatus,
    alumni_verification_status: registration.alumniVerificationStatus,
    ...normalizeScreeningFields(registration),
    alumni_previous_cohort: registration.alumniPreviousCohort,
    alumni_previous_email: registration.alumniPreviousEmail,
    alumni_previous_phone: registration.alumniPreviousPhone,
    alumni_student_id: registration.alumniStudentId,
    theological_institution: registration.theologicalInstitution,
    theological_programme: registration.theologicalProgramme,
    theological_duration: registration.theologicalDuration,
    theological_year_completed: registration.theologicalYearCompleted,
    theological_qualification: registration.theologicalQualification,
    funding_route: registration.fundingRoute,
    scholarship_status: registration.scholarshipStatus,
    scholarship_reason: registration.scholarshipReason,
    scholarship_financial_situation: registration.scholarshipFinancialSituation,
    scholarship_can_contribute: registration.scholarshipCanContribute,
    scholarship_contribution_amount: registration.scholarshipContributionAmount,
    amount: fee.amount,
    amount_paid: null,
    payment_expected_amount: registration.fundingRoute === "self_pay" ? fee.amount : null,
    financial_requirement_status: "payment_required",
    currency: fee.currency,
    public_fee_display: publicFeeDisplay(fee),
    amount_display: fee.display,
    exchange_note: exchangeNote(fee),
    application_status: "pending_review",
  };
}

function paystackRawWithReconciliation(paystackData: PaystackVerificationData, reconciliation: PaymentReconciliation, reconciledAt: string) {
  return {
    ...paystackData,
    realms_payment_reconciliation: {
      expected_amount_kobo: reconciliation.expectedKobo,
      amount_paid_kobo: reconciliation.receivedKobo,
      payment_variance_type: reconciliation.varianceType,
      payment_variance_kobo: reconciliation.varianceKobo,
      paystack_fees_kobo: paystackData.fees ?? null,
      currency: reconciliation.receivedCurrency,
      payment_verified_at: reconciliation.accepted ? reconciledAt : null,
      reconciled_at: reconciledAt,
    },
  };
}

export function buildVerifiedPaymentColumns(paystackData: PaystackVerificationData, reconciliation: PaymentReconciliation) {
  const verifiedAt = paystackData.paid_at ?? paystackData.paidAt ?? new Date().toISOString();
  return {
    amount_paid: paystackData.amount / 100,
    payment_status: "success",
    financial_requirement_status: "satisfied_by_payment",
    payment_reference: paystackData.reference,
    paid_at: verifiedAt,
    paystack_customer_email: readCustomerEmail(paystackData.customer),
    paystack_raw: paystackRawWithReconciliation(paystackData, reconciliation, verifiedAt),
    metadata: paystackData.metadata ?? {},
  };
}

export async function createRegistrationApplication(registration: RegistrationPayload, fee: CohortFee, paymentReference: string | null, submissionKeyHash?: string | null) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const payload = {
    ...buildRegistrationColumns(registration, fee),
    payment_reference: paymentReference,
    payment_status: registration.fundingRoute === "scholarship_request" ? "not_paid" : "pending",
    paid_at: null,
    submission_key_hash: submissionKeyHash || null,
  };
  if (process.env.NODE_ENV !== "production") {
    console.log("Normalized screening payload:", {
      applicant_type: payload.applicant_type,
      screening_answers: payload.screening_answers,
      screening_objective_score: payload.screening_objective_score,
      screening_objective_max: payload.screening_objective_max,
      screening_short_answer_score: payload.screening_short_answer_score,
      screening_short_answer_max: payload.screening_short_answer_max,
      screening_status: payload.screening_status,
    });
  }
  const { data, error } = await supabase
    .from("registrations")
    .insert(payload)
    .select("id, payment_reference, payment_status, payment_authorization_url")
    .single();
  if (error || !data?.id) {
    if (submissionKeyHash) {
      const existing = await supabase
        .from("registrations")
        .select("id, payment_reference, payment_status, payment_authorization_url")
        .eq("submission_key_hash", submissionKeyHash)
        .maybeSingle();
      if (!existing.error && existing.data?.id) {
        const id = String(existing.data.id);
        return {
          id,
          applicationReference: id,
          paymentReference: typeof existing.data.payment_reference === "string" ? existing.data.payment_reference : null,
          paymentStatus: typeof existing.data.payment_status === "string" ? existing.data.payment_status : null,
          paymentAuthorizationUrl: typeof existing.data.payment_authorization_url === "string" ? existing.data.payment_authorization_url : null,
          reused: true,
        };
      }
    }
    console.error("Supabase application save failed:", error);
    throw new Error(`APPLICATION_SAVE_FAILED:${error?.message || "No application record was returned."}`);
  }
  const id = String(data.id);
  return {
    id,
    applicationReference: id,
    paymentReference: typeof data.payment_reference === "string" ? data.payment_reference : null,
    paymentStatus: typeof data.payment_status === "string" ? data.payment_status : null,
    paymentAuthorizationUrl: typeof data.payment_authorization_url === "string" ? data.payment_authorization_url : null,
    reused: false,
  };
}

export async function recordRegistrationPaymentInitialization(applicationId: string, paymentReference: string, authorizationUrl: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const initializedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("registrations")
    .update({ payment_authorization_url: authorizationUrl, payment_initialized_at: initializedAt, updated_at: initializedAt })
    .eq("id", applicationId)
    .eq("payment_reference", paymentReference)
    .eq("payment_status", "pending")
    .select("id")
    .maybeSingle();
  if (error || !data?.id) throw new Error(`PAYMENT_INITIALIZATION_SAVE_FAILED:${error?.message || "Application state changed."}`);
}

export async function validateRegistrationApplicationForPayment(input: { applicationId: string; paymentReference: string; email: string; amount: number; currency: string }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase
    .from("registrations")
    .select("id, email, funding_route, amount, currency, payment_status, payment_reference, payment_authorization_url")
    .eq("id", input.applicationId)
    .maybeSingle();
  if (error || !data) throw new Error(`APPLICATION_PAYMENT_STATE_UNAVAILABLE:${error?.message || "Application was not found."}`);
  const valid = data.funding_route === "self_pay"
    && data.payment_status === "pending"
    && data.payment_reference === input.paymentReference
    && String(data.email || "").trim().toLowerCase() === input.email.trim().toLowerCase()
    && Number(data.amount) === input.amount
    && String(data.currency || "").toUpperCase() === input.currency.toUpperCase();
  if (!valid) throw new Error("APPLICATION_PAYMENT_STATE_INVALID");
  return { authorizationUrl: typeof data.payment_authorization_url === "string" ? data.payment_authorization_url : null };
}

export function normalizePaystackRegistrationMetadata(metadata: unknown): NormalizedPaystackRegistrationMetadata {
  const source = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  const applicationReference = readString(source, "application_reference", "applicationReference");
  const applicationId = readString(source, "registration_id", "applicationId", "application_id") || (/^[0-9a-f-]{36}$/i.test(applicationReference) ? applicationReference : "");
  if (applicationId) return { isValid: false, registration: null, calculatedFee: readCalculatedFee(source.calculated_fee ?? source.calculatedFee), missingFields: [], applicationId, applicationReference: applicationReference || applicationId };
  const registrationSource = source.registration && typeof source.registration === "object" && !Array.isArray(source.registration)
    ? source.registration as Record<string, unknown>
    : source;
  const candidate = {
    fullName: readString(registrationSource, "fullName", "full_name", "name"),
    email: readString(registrationSource, "email"),
    whatsapp: readString(registrationSource, "whatsapp"),
    country: readString(registrationSource, "country"),
    city: readString(registrationSource, "city"),
    gender: readString(registrationSource, "gender"),
    ageRange: readString(registrationSource, "ageRange", "age_range"),
    church: readString(registrationSource, "church"),
    learningMode: readString(registrationSource, "learningMode", "learning_mode"),
    skillPathway: readString(registrationSource, "skillPathway", "skill_pathway"),
    reason: readString(registrationSource, "reason"),
    referralSource: readString(registrationSource, "referralSource", "referral_source"),
    consent: readBoolean(registrationSource, "consent"),
    feePolicyConsent: readBoolean(registrationSource, "feePolicyConsent", "fee_policy_consent"),
    computerAccessConfirmed: readBoolean(registrationSource, "computerAccessConfirmed", "computer_access_confirmed"),
    applicantType: readString(registrationSource, "applicantType", "applicant_type") || "new_student",
    alumniPreviousCohort: readNullableString(registrationSource, "alumniPreviousCohort", "alumni_previous_cohort"),
    alumniPreviousEmail: readNullableString(registrationSource, "alumniPreviousEmail", "alumni_previous_email"),
    alumniPreviousPhone: readNullableString(registrationSource, "alumniPreviousPhone", "alumni_previous_phone"),
    alumniStudentId: readNullableString(registrationSource, "alumniStudentId", "alumni_student_id"),
    theologicalInstitution: readNullableString(registrationSource, "theologicalInstitution", "theological_institution"),
    theologicalProgramme: readNullableString(registrationSource, "theologicalProgramme", "theological_programme"),
    theologicalDuration: readNullableString(registrationSource, "theologicalDuration", "theological_duration"),
    theologicalYearCompleted: readNullableString(registrationSource, "theologicalYearCompleted", "theological_year_completed"),
    theologicalQualification: readNullableString(registrationSource, "theologicalQualification", "theological_qualification"),
    screeningAnswers: registrationSource.screeningAnswers ?? registrationSource.screening_answers ?? {},
    fundingRoute: readString(registrationSource, "fundingRoute", "funding_route") || "self_pay",
    scholarshipReason: readNullableString(registrationSource, "scholarshipReason", "scholarship_reason"),
    scholarshipFinancialSituation: readNullableString(registrationSource, "scholarshipFinancialSituation", "scholarship_financial_situation"),
    scholarshipCanContribute: readBoolean(registrationSource, "scholarshipCanContribute", "scholarship_can_contribute"),
    scholarshipContributionAmount: readNumber(registrationSource.scholarshipContributionAmount ?? registrationSource.scholarship_contribution_amount),
  };
  const requiredFields = ["fullName", "email", "whatsapp", "country", "city", "gender", "ageRange", "learningMode", "skillPathway", "reason", "referralSource", "consent"] as const;
  const missingFields = requiredFields.filter((field) => field === "consent" ? !candidate.consent : !candidate[field]);
  const calculatedFee = readCalculatedFee(source.calculatedFee ?? source.calculated_fee);
  if (missingFields.length > 0) return { isValid: false, registration: null, calculatedFee, missingFields };
  const validation = validateRegistrationPayload(candidate);
  if (!validation.success) return { isValid: false, registration: null, calculatedFee, missingFields: Object.keys(validation.errors) };
  return { isValid: true, registration: validation.data, calculatedFee, missingFields: [] };
}

function registrationFromRow(row: Record<string, unknown>) {
  return validateRegistrationPayload({
    fullName: row.full_name,
    email: row.email,
    whatsapp: row.whatsapp,
    country: row.country,
    city: row.city,
    gender: row.gender,
    ageRange: row.age_range,
    church: row.church,
    learningMode: row.learning_mode,
    skillPathway: row.skill_pathway,
    reason: row.reason,
    referralSource: row.referral_source,
    consent: row.consent,
    feePolicyConsent: row.fee_policy_consent,
    computerAccessConfirmed: row.computer_access_confirmed,
    applicantType: row.applicant_type,
    alumniPreviousCohort: row.alumni_previous_cohort,
    alumniPreviousEmail: row.alumni_previous_email,
    alumniPreviousPhone: row.alumni_previous_phone,
    alumniStudentId: row.alumni_student_id,
    theologicalInstitution: row.theological_institution,
    theologicalProgramme: row.theological_programme,
    theologicalDuration: row.theological_duration,
    theologicalYearCompleted: row.theological_year_completed,
    theologicalQualification: row.theological_qualification,
    screeningAnswers: row.screening_answers ?? {},
    fundingRoute: row.funding_route,
    scholarshipReason: row.scholarship_reason,
    scholarshipFinancialSituation: row.scholarship_financial_situation,
    scholarshipCanContribute: row.scholarship_can_contribute,
    scholarshipContributionAmount: row.scholarship_contribution_amount,
  });
}

export async function resolvePaystackRegistration(metadata: unknown, reference: string): Promise<NormalizedPaystackRegistrationMetadata> {
  const normalized = normalizePaystackRegistrationMetadata(metadata);
  const supabase = getSupabaseAdmin();
  let applicationId = normalized.applicationId;
  if (!applicationId && supabase) {
    const fallback = await supabase.from("registrations").select("id").eq("payment_reference", reference).eq("funding_route", "self_pay").maybeSingle();
    if (fallback.error) console.error("Could not look up pre-payment application by payment reference", fallback.error);
    else if (fallback.data?.id) applicationId = String(fallback.data.id);
  }
  if (!applicationId) return normalized;
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) return { isValid: false, registration: null, calculatedFee: null, missingFields: ["applicationId"], applicationId, applicationReference: normalized.applicationReference };
  if (!supabase) return { isValid: false, registration: null, calculatedFee: null, missingFields: ["applicationStorage"], applicationId, applicationReference: normalized.applicationReference };
  const { data, error } = await supabase.from("registrations").select(paymentApplicationSelect).eq("id", applicationId).eq("funding_route", "self_pay").maybeSingle();
  if (error || !data) {
    if (error) console.error("Could not resolve Paystack application:", error);
    return { isValid: false, registration: null, calculatedFee: null, missingFields: ["applicationRecord"], applicationId, applicationReference: normalized.applicationReference };
  }
  if (!paymentReferenceMatchesApplication(data.payment_reference, reference)) {
    console.error("Paystack application reference mismatch", { reference, applicationId });
    return { isValid: false, registration: null, calculatedFee: null, missingFields: ["paymentReference"], applicationId, applicationReference: normalized.applicationReference };
  }
  if (normalized.applicationReference && normalized.applicationReference !== applicationId) {
    console.error("Paystack application identity mismatch", { reference, applicationId });
    return { isValid: false, registration: null, calculatedFee: null, missingFields: ["applicationReference"], applicationId, applicationReference: normalized.applicationReference };
  }
  const validation = registrationFromRow(data as Record<string, unknown>);
  if (!validation.success) return { isValid: false, registration: null, calculatedFee: null, missingFields: Object.keys(validation.errors), applicationId, applicationReference: normalized.applicationReference };
  return {
    isValid: true,
    registration: validation.data,
    calculatedFee: {
      amount: Number(data.amount),
      currency: String(data.currency),
      display: String(data.amount_display || `${data.currency} ${data.amount}`),
      publicDisplay: typeof data.public_fee_display === "string" ? data.public_fee_display : undefined,
      exchangeNote: typeof data.exchange_note === "string" ? data.exchange_note : undefined,
    },
    missingFields: [],
    applicationId,
    applicationReference: normalized.applicationReference || applicationId,
  };
}

async function assertPaystackTransactionOwnership(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, paystackData: PaystackVerificationData, applicationId: string) {
  if (paystackData.id === undefined || paystackData.id === null) return;
  const assigned = await supabase.from("registrations").select("id").eq("paystack_raw->>id", String(paystackData.id)).neq("id", applicationId).limit(1).maybeSingle();
  if (assigned.error) throw new Error("PAYSTACK_TRANSACTION_OWNERSHIP_CHECK_FAILED");
  if (assigned.data) throw new PaymentRegistrationConflictError();
}

export async function recordUnconfirmedRegistrationPayment(paystackData: PaystackVerificationData, resolved: NormalizedPaystackRegistrationMetadata, reconciliation: PaymentReconciliation) {
  if (!resolved.isValid || !resolved.applicationId || reconciliation.accepted) throw new PaymentRegistrationConflictError();
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const current = await supabase.from("registrations").select("id, payment_reference, payment_status").eq("id", resolved.applicationId).eq("funding_route", "self_pay").maybeSingle();
  if (current.error || !current.data || !paymentReferenceMatchesApplication(current.data.payment_reference, paystackData.reference)) throw new PaymentRegistrationConflictError();
  if (current.data.payment_status === "success") throw new PaymentRegistrationConflictError();
  await assertPaystackTransactionOwnership(supabase, paystackData, resolved.applicationId);
  const reconciledAt = new Date().toISOString();
  const saved = await supabase.from("registrations").update({
    amount_paid: paystackData.amount / 100,
    payment_status: reconciliation.varianceType,
    paystack_customer_email: readCustomerEmail(paystackData.customer),
    paystack_raw: paystackRawWithReconciliation(paystackData, reconciliation, reconciledAt),
    metadata: paystackData.metadata ?? {},
  }).eq("id", resolved.applicationId).eq("payment_reference", paystackData.reference).neq("payment_status", "success");
  if (saved.error) throw new Error("UNCONFIRMED_PAYMENT_RECONCILIATION_FAILED");
  const eventType = reconciliation.varianceType === "underpayment" ? "payment_underpaid" : "payment_currency_mismatch";
  const prior = await supabase.from("registration_review_events").select("id").eq("registration_id", resolved.applicationId).eq("event_type", eventType).limit(1).maybeSingle();
  if (!prior.error && !prior.data) {
    const event = await supabase.from("registration_review_events").insert({
      registration_id: resolved.applicationId,
      event_type: eventType,
      previous_state: { payment_status: current.data.payment_status },
      new_state: {
        payment_status: reconciliation.varianceType,
        payment_reference: paystackData.reference,
        expected_amount_kobo: reconciliation.expectedKobo,
        amount_paid_kobo: reconciliation.receivedKobo,
        payment_variance_kobo: reconciliation.varianceKobo,
        expected_currency: reconciliation.expectedCurrency,
        received_currency: reconciliation.receivedCurrency,
      },
      note: "Registration payment remains unconfirmed pending reconciliation.",
      actor: "Paystack verification",
    });
    if (event.error) console.error("Unconfirmed payment audit insert failed", { registrationId: resolved.applicationId, reference: paystackData.reference });
  }
}

async function updateExistingApplication(paystackData: PaystackVerificationData, applicationId: string, reconciliation: PaymentReconciliation): Promise<RegistrationSaveResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { saved: false, reason: "Supabase is not configured." };
  const { data: existing, error: existingError } = await supabase.from("registrations").select(savedRegistrationSelect).eq("id", applicationId).eq("funding_route", "self_pay").maybeSingle();
  if (existingError || !existing) {
    if (existingError) console.error("Supabase payment application lookup failed:", existingError);
    return { saved: false, reason: "Payment confirmed, but the saved application record could not be found." };
  }
  if (!paymentReferenceMatchesApplication(existing.payment_reference, paystackData.reference)) throw new PaymentRegistrationConflictError();
  await assertPaystackTransactionOwnership(supabase, paystackData, applicationId);
  if (existing.payment_status === "success") {
    if (Number(existing.amount_paid) !== paystackData.amount / 100 || String(existing.currency).toUpperCase() !== paystackData.currency.toUpperCase()) throw new PaymentRegistrationConflictError();
    const paymentVerificationAuditStatus = await recordPaymentVerificationEvent(supabase, { registrationId: String(existing.id), reference: paystackData.reference, previousStatus: "success", reconciliation });
    return { saved: true, id: String(existing.id), registration: existing as SavedRegistration, paymentVerificationAuditStatus };
  }
  const { data, error } = await supabase
    .from("registrations")
    .update(buildVerifiedPaymentColumns(paystackData, reconciliation))
    .eq("id", applicationId)
    .eq("funding_route", "self_pay")
    .neq("payment_status", "success")
    .select(savedRegistrationSelect)
    .maybeSingle();
  if (error) {
    console.error("Supabase verified application update failed:", error);
    throw new Error(`Supabase registration update failed: ${error?.message || "No saved record was returned."}`);
  }
  if (!data?.id) {
    const concurrent = await supabase.from("registrations").select(savedRegistrationSelect).eq("id", applicationId).eq("payment_reference", paystackData.reference).eq("payment_status", "success").maybeSingle();
    if (concurrent.error || !concurrent.data?.id || Number(concurrent.data.amount_paid) !== paystackData.amount / 100) throw new PaymentRegistrationConflictError();
    const paymentVerificationAuditStatus = await recordPaymentVerificationEvent(supabase, { registrationId: String(concurrent.data.id), reference: paystackData.reference, previousStatus: "success", reconciliation });
    return { saved: true, id: String(concurrent.data.id), registration: concurrent.data as SavedRegistration, paymentVerificationAuditStatus };
  }
  const paymentVerificationAuditStatus = await recordPaymentVerificationEvent(supabase, { registrationId: String(data.id), reference: paystackData.reference, previousStatus: String(existing.payment_status), reconciliation });
  return { saved: true, id: String(data.id), registration: data as SavedRegistration, paymentVerificationAuditStatus };
}

export async function saveVerifiedRegistrationFromPaystack(paystackData: PaystackVerificationData, resolved: NormalizedPaystackRegistrationMetadata | undefined, reconciliation: PaymentReconciliation): Promise<RegistrationSaveResult> {
  const metadata = paystackData.metadata ?? {};
  if (!metadata || Object.keys(metadata).length === 0) return { saved: false, reason: "Payment confirmed, but registration metadata was not found." };
  const normalized = resolved ?? await resolvePaystackRegistration(metadata, paystackData.reference);
  if (!normalized.isValid) return { saved: false, reason: "Payment confirmed, but registration metadata was invalid." };
  if (!paystackData.reference) return { saved: false, reason: "Payment confirmed, but Paystack did not return a payment reference." };
  if (normalized.applicationId) return updateExistingApplication(paystackData, normalized.applicationId, reconciliation);

  const supabase = getSupabaseAdmin();
  if (!supabase) return { saved: false, reason: "Supabase is not configured." };
  const registration = normalized.registration;
  const calculatedFee = normalized.calculatedFee ?? calculateCohortFee(registration);
  if (!calculatedFee) return { saved: false, reason: "Payment confirmed, but registration fee metadata was not found." };
  const { data, error } = await supabase
    .from("registrations")
    .insert({
      ...buildRegistrationColumns(registration, calculatedFee as CohortFee),
      ...buildVerifiedPaymentColumns(paystackData, reconciliation),
      metadata,
    })
    .select(savedRegistrationSelect)
    .single();
  if (error?.code === "23505") {
    const { data: existing, error: existingError } = await supabase.from("registrations").select(savedRegistrationSelect).eq("payment_reference", paystackData.reference).maybeSingle();
    if (existingError || !existing?.id) throw new Error(`Supabase registration lookup failed: ${existingError?.message || "No saved record was returned."}`);
    return updateExistingApplication(paystackData, String(existing.id), reconciliation);
  }
  if (error || !data?.id) {
    console.error("Supabase registration save failed:", error);
    throw new Error(`Supabase registration save failed: ${error?.message || "No saved record was returned."}`);
  }
  const paymentVerificationAuditStatus = await recordPaymentVerificationEvent(supabase, { registrationId: String(data.id), reference: paystackData.reference, previousStatus: "not_created", reconciliation });
  return { saved: true, id: String(data.id), registration: data as SavedRegistration, paymentVerificationAuditStatus };
}
