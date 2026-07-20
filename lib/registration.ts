import { ageRanges, cohortPricing, genderOptions, learningModes, skillPathways } from "@/lib/constants";
import {
  foundationalScreeningQuestions,
  foundationalScreeningShortAnswers,
  type FoundationalAnswerOption,
  type FoundationalQuestionId,
  type FoundationalScreeningAnswers,
  type FoundationalShortAnswerId,
} from "@/lib/foundationalScreeningQuestions";

export const applicantTypes = ["new_student", "realms_alumnus", "prior_theological_education"] as const;
export const requestedDiscipleshipRoutes = ["foundational", "advanced"] as const;
export const assignedDiscipleshipRoutes = ["foundational", "advanced"] as const;
export const advancedEntryStatuses = ["not_applicable", "pending_alumni_verification", "pending_screening_review", "advanced_approved", "foundation_required", "more_information_required"] as const;
export const alumniVerificationStatuses = ["not_applicable", "pending", "verified", "not_verified", "more_information_required"] as const;
export const screeningStatuses = ["not_required", "submitted", "under_review", "advanced_approved", "foundation_required", "more_information_required"] as const;
export const fundingRoutes = ["self_pay", "scholarship_request"] as const;
export const scholarshipStatuses = ["not_requested", "pending", "more_information_required", "approved_full", "approved_partial", "declined"] as const;

export type ApplicantType = (typeof applicantTypes)[number];
export type RequestedDiscipleshipRoute = (typeof requestedDiscipleshipRoutes)[number];
export type AssignedDiscipleshipRoute = (typeof assignedDiscipleshipRoutes)[number] | null;
export type AdvancedEntryStatus = (typeof advancedEntryStatuses)[number];
export type AlumniVerificationStatus = (typeof alumniVerificationStatuses)[number];
export type ScreeningStatus = (typeof screeningStatuses)[number];
export type FundingRoute = (typeof fundingRoutes)[number];
export type ScholarshipStatus = (typeof scholarshipStatuses)[number];
export type ScreeningAnswers = Record<string, unknown>;

export type RegistrationPayload = {
  fullName: string;
  email: string;
  whatsapp: string;
  country: string;
  city: string;
  gender: string;
  ageRange: string;
  church: string;
  learningMode: string;
  skillPathway: string;
  reason: string;
  referralSource: string;
  consent: boolean;
  feePolicyConsent: boolean;
  computerAccessConfirmed: boolean;
  applicantType: ApplicantType;
  requestedDiscipleshipRoute: RequestedDiscipleshipRoute;
  assignedDiscipleshipRoute: AssignedDiscipleshipRoute;
  advancedEntryStatus: AdvancedEntryStatus;
  alumniVerificationStatus: AlumniVerificationStatus;
  screeningStatus: ScreeningStatus;
  alumniPreviousCohort: string | null;
  alumniPreviousEmail: string | null;
  alumniPreviousPhone: string | null;
  alumniStudentId: string | null;
  theologicalInstitution: string | null;
  theologicalProgramme: string | null;
  theologicalDuration: string | null;
  theologicalYearCompleted: string | null;
  theologicalQualification: string | null;
  screeningAnswers: ScreeningAnswers;
  fundingRoute: FundingRoute;
  scholarshipStatus: ScholarshipStatus;
  scholarshipReason: string | null;
  scholarshipFinancialSituation: string | null;
  scholarshipCanContribute: boolean | null;
  scholarshipContributionAmount: number | null;
};

export type RegistrationDetails = RegistrationPayload;
export type CohortFee = (typeof cohortPricing)[keyof typeof cohortPricing];
export type RegistrationErrors = Partial<Record<keyof RegistrationPayload | "form", string>>;

export type RegistrationValidationResult =
  | { success: true; data: RegistrationPayload }
  | { success: false; message: string; errors: RegistrationErrors };

const requiredTextFields = [
  "fullName", "email", "whatsapp", "country", "city", "gender", "ageRange",
  "learningMode", "skillPathway", "reason", "referralSource",
] as const;

const internationalPhysicalMessage = "Physical attendance is currently designed for students who can attend onsite in Nigeria. Please select Online unless you have confirmed onsite availability.";

function text(input: Record<string, unknown>, key: string, maxLength = 2000) {
  const value = input[key];
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function nullableText(input: Record<string, unknown>, key: string, maxLength = 2000) {
  return text(input, key, maxLength) || null;
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseScreeningAnswers(value: unknown): FoundationalScreeningAnswers | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.objective) || !Array.isArray(input.shortAnswers)) return null;

  const questionIds = new Set<string>(foundationalScreeningQuestions.map((question) => question.id));
  const shortAnswerIds = new Set<string>(foundationalScreeningShortAnswers.map((question) => question.id));
  const options = new Set(["A", "B", "C", "D"]);

  const objective = input.objective.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const response = entry as Record<string, unknown>;
    if (typeof response.questionId !== "string" || !questionIds.has(response.questionId)) return [];
    if (typeof response.answer !== "string" || !options.has(response.answer)) return [];
    return [{ questionId: response.questionId as FoundationalQuestionId, answer: response.answer as FoundationalAnswerOption }];
  });
  const shortAnswers = input.shortAnswers.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const response = entry as Record<string, unknown>;
    if (typeof response.questionId !== "string" || !shortAnswerIds.has(response.questionId)) return [];
    if (typeof response.response !== "string" || !response.response.trim() || response.response.trim().length > 5000) return [];
    return [{ questionId: response.questionId as FoundationalShortAnswerId, response: response.response.trim() }];
  });

  if (objective.length !== foundationalScreeningQuestions.length || new Set(objective.map((answer) => answer.questionId)).size !== foundationalScreeningQuestions.length) return null;
  if (shortAnswers.length !== foundationalScreeningShortAnswers.length || new Set(shortAnswers.map((answer) => answer.questionId)).size !== foundationalScreeningShortAnswers.length) return null;
  return { objective, shortAnswers };
}

export function hasFoundationalScreeningAnswers(value: ScreeningAnswers): value is FoundationalScreeningAnswers {
  return parseScreeningAnswers(value) !== null;
}

export function normalizeScreeningAnswers(applicantType: ApplicantType, submittedScreeningAnswers: unknown): ScreeningAnswers {
  if (applicantType !== "prior_theological_education") return {};
  return parseScreeningAnswers(submittedScreeningAnswers) ?? {};
}

function routeAssignment(applicantType: ApplicantType) {
  if (applicantType === "new_student") {
    return {
      requestedDiscipleshipRoute: "foundational" as const,
      assignedDiscipleshipRoute: "foundational" as const,
      advancedEntryStatus: "not_applicable" as const,
      alumniVerificationStatus: "not_applicable" as const,
      screeningStatus: "not_required" as const,
    };
  }
  if (applicantType === "realms_alumnus") {
    return {
      requestedDiscipleshipRoute: "advanced" as const,
      assignedDiscipleshipRoute: null,
      advancedEntryStatus: "pending_alumni_verification" as const,
      alumniVerificationStatus: "pending" as const,
      screeningStatus: "not_required" as const,
    };
  }
  return {
    requestedDiscipleshipRoute: "advanced" as const,
    assignedDiscipleshipRoute: null,
    advancedEntryStatus: "pending_screening_review" as const,
    alumniVerificationStatus: "not_applicable" as const,
    screeningStatus: "submitted" as const,
  };
}

export function normalizeCountry(country: string) {
  return country.trim().replace(/\s+/g, " ");
}

export function isNigeria(country: string) {
  return normalizeCountry(country).toLowerCase() === "nigeria";
}

export function calculateCohortFee(payload: Pick<RegistrationPayload, "country" | "learningMode">): CohortFee | null {
  if (payload.learningMode === "Physical") return cohortPricing.physical;
  if (payload.learningMode === "Online" && isNigeria(payload.country)) return cohortPricing.onlineNigeria;
  if (payload.learningMode === "Online") return cohortPricing.internationalOnline;
  return null;
}

export function validateRegistrationPayload(value: unknown): RegistrationValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { success: false, message: "Please complete the registration form correctly.", errors: { form: "A valid registration payload is required." } };
  }

  const input = value as Record<string, unknown>;
  const errors: RegistrationErrors = {};
  for (const field of requiredTextFields) {
    const fieldValue = input[field];
    if (typeof fieldValue !== "string" || !fieldValue.trim()) errors[field] = "This field is required.";
    else if (fieldValue.length > 2000) errors[field] = "This response is too long.";
  }

  const email = text(input, "email", 320);
  if (email && !validEmail(email)) errors.email = "Please enter a valid email address.";
  if (input.consent !== true) errors.consent = "Please confirm your consent before continuing.";
  if (typeof input.gender === "string" && !(genderOptions as readonly string[]).includes(input.gender)) errors.gender = "Please select Male or Female.";
  if (typeof input.ageRange === "string" && !(ageRanges as readonly string[]).includes(input.ageRange)) errors.ageRange = "Please select a valid age range.";
  if (typeof input.learningMode === "string" && !(learningModes as readonly string[]).includes(input.learningMode)) errors.learningMode = "Please select Physical or Online.";
  if (typeof input.skillPathway === "string" && !(skillPathways as readonly string[]).includes(input.skillPathway)) errors.skillPathway = "Please select an available skill pathway.";
  if (input.computerAccessConfirmed !== true) errors.computerAccessConfirmed = "Please confirm access to a laptop or desktop computer for this skill pathway.";

  const applicantTypeProvided = input.applicantType !== undefined && input.applicantType !== null && input.applicantType !== "";
  const applicantType = (applicantTypes as readonly unknown[]).includes(input.applicantType) ? input.applicantType as ApplicantType : "new_student";
  if (applicantTypeProvided && !(applicantTypes as readonly unknown[]).includes(input.applicantType)) errors.applicantType = "Please select a valid applicant type.";
  const fundingRouteProvided = input.fundingRoute !== undefined && input.fundingRoute !== null && input.fundingRoute !== "";
  const fundingRoute = (fundingRoutes as readonly unknown[]).includes(input.fundingRoute) ? input.fundingRoute as FundingRoute : "self_pay";
  if (fundingRouteProvided && !(fundingRoutes as readonly unknown[]).includes(input.fundingRoute)) errors.fundingRoute = "Please select a valid funding route.";
  if (fundingRoute === "self_pay" && input.feePolicyConsent !== true) errors.feePolicyConsent = "Please confirm the registration/application fee policy before continuing.";

  const country = typeof input.country === "string" ? normalizeCountry(input.country) : "";
  if (country && !isNigeria(country) && input.learningMode === "Physical") errors.learningMode = internationalPhysicalMessage;

  let alumniPreviousCohort = nullableText(input, "alumniPreviousCohort", 200);
  let alumniPreviousEmail = nullableText(input, "alumniPreviousEmail", 320);
  let alumniPreviousPhone = nullableText(input, "alumniPreviousPhone", 100);
  let alumniStudentId = nullableText(input, "alumniStudentId", 100);
  let theologicalInstitution = nullableText(input, "theologicalInstitution", 300);
  let theologicalProgramme = nullableText(input, "theologicalProgramme", 300);
  let theologicalDuration = nullableText(input, "theologicalDuration", 100);
  let theologicalYearCompleted = nullableText(input, "theologicalYearCompleted", 100);
  let theologicalQualification = nullableText(input, "theologicalQualification", 300);
  let screeningAnswers: ScreeningAnswers = {};

  if (applicantType === "realms_alumnus") {
    if (!alumniPreviousCohort) errors.alumniPreviousCohort = "Please enter your previous REALMS cohort.";
    if (!alumniPreviousEmail || !validEmail(alumniPreviousEmail)) errors.alumniPreviousEmail = "Please enter the email used during your previous cohort.";
    if (!alumniPreviousPhone) errors.alumniPreviousPhone = "Please enter the phone or WhatsApp number used during your previous cohort.";
  } else {
    alumniPreviousCohort = alumniPreviousEmail = alumniPreviousPhone = alumniStudentId = null;
  }

  if (applicantType === "prior_theological_education") {
    if (!theologicalInstitution) errors.theologicalInstitution = "Please enter the training institution or ministry.";
    if (!theologicalProgramme) errors.theologicalProgramme = "Please enter the programme or course studied.";
    if (!theologicalDuration) errors.theologicalDuration = "Please enter the approximate duration.";
    if (!theologicalYearCompleted) errors.theologicalYearCompleted = "Please enter the year completed.";
    screeningAnswers = normalizeScreeningAnswers(applicantType, input.screeningAnswers);
    if (!hasFoundationalScreeningAnswers(screeningAnswers)) errors.screeningAnswers = "Please answer all objective and long-answer screening questions.";
  } else {
    theologicalInstitution = theologicalProgramme = theologicalDuration = theologicalYearCompleted = theologicalQualification = null;
  }

  let scholarshipReason = nullableText(input, "scholarshipReason", 5000);
  let scholarshipFinancialSituation = nullableText(input, "scholarshipFinancialSituation", 5000);
  let scholarshipCanContribute: boolean | null = null;
  let scholarshipContributionAmount: number | null = null;
  if (fundingRoute === "scholarship_request") {
    if (!scholarshipReason) errors.scholarshipReason = "Please explain why you are requesting scholarship support.";
    if (!scholarshipFinancialSituation) errors.scholarshipFinancialSituation = "Please briefly describe your current financial situation.";
    if (typeof input.scholarshipCanContribute !== "boolean") errors.scholarshipCanContribute = "Please select Yes or No.";
    else scholarshipCanContribute = input.scholarshipCanContribute;
    if (scholarshipCanContribute) {
      const amount = typeof input.scholarshipContributionAmount === "number" ? input.scholarshipContributionAmount : Number(input.scholarshipContributionAmount);
      if (!Number.isFinite(amount) || amount <= 0) errors.scholarshipContributionAmount = "Please enter the amount you are able to contribute.";
      else scholarshipContributionAmount = amount;
    }
  } else {
    scholarshipReason = scholarshipFinancialSituation = null;
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, message: errors.learningMode === internationalPhysicalMessage ? internationalPhysicalMessage : "Please review the registration details and try again.", errors };
  }

  const route = routeAssignment(applicantType);
  return {
    success: true,
    data: {
      fullName: text(input, "fullName", 300),
      email,
      whatsapp: text(input, "whatsapp", 100),
      country,
      city: text(input, "city", 200),
      gender: String(input.gender),
      ageRange: String(input.ageRange),
      church: text(input, "church", 300),
      learningMode: String(input.learningMode),
      skillPathway: String(input.skillPathway),
      reason: text(input, "reason", 5000),
      referralSource: text(input, "referralSource", 2000),
      consent: true,
      feePolicyConsent: fundingRoute === "self_pay",
      computerAccessConfirmed: true,
      applicantType,
      ...route,
      alumniPreviousCohort,
      alumniPreviousEmail,
      alumniPreviousPhone,
      alumniStudentId,
      theologicalInstitution,
      theologicalProgramme,
      theologicalDuration,
      theologicalYearCompleted,
      theologicalQualification,
      screeningAnswers,
      fundingRoute,
      scholarshipStatus: fundingRoute === "scholarship_request" ? "pending" : "not_requested",
      scholarshipReason,
      scholarshipFinancialSituation,
      scholarshipCanContribute,
      scholarshipContributionAmount,
    },
  };
}

export function generatePaymentReference() {
  return `REALMS-${Date.now()}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
}
