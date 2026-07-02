import { ageRanges, cohortPricing, genderOptions, learningModes, skillPathways } from "@/lib/constants";

export type RegistrationDetails = {
  fullName: string;
  email: string;
  whatsapp: string;
  gender: string;
  ageRange: string;
  country: string;
  city: string;
  church: string;
  learningMode: string;
  skillPathway: string;
  reason: string;
  referralSource: string;
  consent: boolean;
};

const textFields: (keyof Omit<RegistrationDetails, "consent">)[] = [
  "fullName", "email", "whatsapp", "country", "city", "gender", "ageRange", "church",
  "learningMode", "skillPathway", "reason", "referralSource",
];

export function validateRegistration(value: unknown): RegistrationDetails | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (input.consent !== true) return null;
  for (const field of textFields) {
    if (typeof input[field] !== "string" || !input[field].trim() || input[field].length > 2000) return null;
  }
  const email = String(input.email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (!(genderOptions as readonly string[]).includes(String(input.gender))) return null;
  if (!(ageRanges as readonly string[]).includes(String(input.ageRange))) return null;
  if (!(learningModes as readonly string[]).includes(String(input.learningMode))) return null;
  if (!(skillPathways as readonly string[]).includes(String(input.skillPathway))) return null;
  return Object.fromEntries([
    ...textFields.map((field) => [field, String(input[field]).trim()]),
    ["consent", true],
  ]) as RegistrationDetails;
}

export function calculateCohortFee(country: string, learningMode: string) {
  if (learningMode === "Physical") return cohortPricing.physical;
  if (learningMode === "Online" && country.trim().toLowerCase() === "nigeria") {
    return cohortPricing.onlineNigeria;
  }
  if (learningMode === "Online") return cohortPricing.internationalOnline;
  return null;
}
