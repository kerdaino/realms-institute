import { ageRanges, cohortPricing, currentCohortPathways, genderOptions, learningModes, skillPathways } from "@/lib/constants";

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
] as const satisfies readonly (keyof RegistrationPayload)[];

const internationalPhysicalMessage = "Physical attendance is currently designed for students who can attend onsite in Nigeria. Please select Online unless you have confirmed onsite availability.";

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
    if (typeof input[field] !== "string" || !input[field].trim()) {
      errors[field] = "This field is required.";
    } else if (input[field].length > 2000) {
      errors[field] = "This response is too long.";
    }
  }

  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Please enter a valid email address.";
  if (input.consent !== true) errors.consent = "Please confirm your consent before continuing.";
  if (input.feePolicyConsent !== true) errors.feePolicyConsent = "Please confirm the registration/application fee policy before continuing.";
  if (typeof input.gender === "string" && !(genderOptions as readonly string[]).includes(input.gender)) errors.gender = "Please select Male or Female.";
  if (typeof input.ageRange === "string" && !(ageRanges as readonly string[]).includes(input.ageRange)) errors.ageRange = "Please select a valid age range.";
  if (typeof input.learningMode === "string" && !(learningModes as readonly string[]).includes(input.learningMode)) errors.learningMode = "Please select Physical or Online.";
  if (typeof input.skillPathway === "string" && !(skillPathways as readonly string[]).includes(input.skillPathway)) errors.skillPathway = "Please select an available skill pathway.";
  if ((currentCohortPathways as readonly string[]).includes(String(input.skillPathway)) && input.computerAccessConfirmed !== true) {
    errors.computerAccessConfirmed = "Please confirm access to a laptop or desktop computer for this skill pathway.";
  }

  const country = typeof input.country === "string" ? normalizeCountry(input.country) : "";
  if (country && !isNigeria(country) && input.learningMode === "Physical") errors.learningMode = internationalPhysicalMessage;

  if (Object.keys(errors).length > 0) {
    return { success: false, message: errors.learningMode === internationalPhysicalMessage ? internationalPhysicalMessage : "Please review the highlighted registration details and try again.", errors };
  }

  return {
    success: true,
    data: {
      fullName: String(input.fullName).trim(),
      email,
      whatsapp: String(input.whatsapp).trim(),
      country,
      city: String(input.city).trim(),
      gender: String(input.gender),
      ageRange: String(input.ageRange),
      church: typeof input.church === "string" ? input.church.trim() : "",
      learningMode: String(input.learningMode),
      skillPathway: String(input.skillPathway),
      reason: String(input.reason).trim(),
      referralSource: String(input.referralSource).trim(),
      consent: true,
      feePolicyConsent: true,
      computerAccessConfirmed: input.computerAccessConfirmed === true,
    },
  };
}

export function generatePaymentReference() {
  return `REALMS-${Date.now()}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
}
