export const assessmentDomains = ["discipleship", "skill"] as const;
export type AssessmentDomain = (typeof assessmentDomains)[number];

export const assessmentCategories = {
  discipleship: ["weekly_quiz_reflection", "route_application", "route_practical", "growth_integration", "final_route_assessment"],
  skill: ["weekly_practical", "assignment_mini_project", "documentation", "time_management", "capstone"],
} as const satisfies Record<AssessmentDomain, readonly string[]>;

export const assignmentTypes = ["assignment", "reflection", "practical", "case_study", "project", "report", "worksheet", "documentation", "time_management", "ministry_practical", "capstone", "other"] as const;
export const assignmentStatuses = ["draft", "published", "closed", "archived"] as const;
export const quizQuestionTypes = ["multiple_choice", "true_false", "short_answer"] as const;
export const quizStatuses = ["draft", "published", "closed", "archived"] as const;
export const reviewOutcomes = ["accepted", "revision_required", "not_accepted"] as const;

export type SubmissionRequirements = {
  text_response_required: boolean;
  repository_url_required: boolean;
  deployment_url_required: boolean;
  external_url_allowed: boolean;
  file_upload_allowed: boolean;
};

export const emptySubmissionRequirements: SubmissionRequirements = {
  text_response_required: false,
  repository_url_required: false,
  deployment_url_required: false,
  external_url_allowed: true,
  file_upload_allowed: false,
};

export function categoryMatchesDomain(domain: string, category: string) {
  if (!assessmentDomains.includes(domain as AssessmentDomain)) return false;
  return (assessmentCategories[domain as AssessmentDomain] as readonly string[]).includes(category);
}

export function scorePercentage(points: number, maximum: number) {
  if (!Number.isFinite(points) || !Number.isFinite(maximum) || maximum <= 0) return 0;
  return Number(Math.max(0, Math.min(100, (points / maximum) * 100)).toFixed(2));
}

export function nextAttemptNumber(attempts: readonly { attempt_number: number }[]) {
  return attempts.reduce((maximum, attempt) => Math.max(maximum, Number(attempt.attempt_number) || 0), 0) + 1;
}

export function quizExpiry(startedAt: Date, durationMinutes: number | null, closesAt: string | null) {
  const durationExpiry = durationMinutes && durationMinutes > 0 ? startedAt.valueOf() + durationMinutes * 60_000 : Number.POSITIVE_INFINITY;
  const closingExpiry = closesAt ? Date.parse(closesAt) : Number.POSITIVE_INFINITY;
  const expiry = Math.min(durationExpiry, closingExpiry);
  return Number.isFinite(expiry) ? new Date(expiry).toISOString() : null;
}

export function normalizedAutomaticAnswer(type: string, answer: unknown) {
  if (type === "true_false") {
    if (typeof answer === "boolean") return answer;
    if (typeof answer === "string" && ["true", "false"].includes(answer.toLowerCase())) return answer.toLowerCase() === "true";
  }
  return typeof answer === "string" ? answer.trim() : answer;
}

export function automaticAnswersEqual(type: string, expected: unknown, submitted: unknown) {
  return JSON.stringify(normalizedAutomaticAnswer(type, expected)) === JSON.stringify(normalizedAutomaticAnswer(type, submitted));
}

export function assessmentUrgency(input: { dueAt?: string | null; kind: string; status: string }) {
  const due = input.dueAt ? Date.parse(input.dueAt) : Number.POSITIVE_INFINITY;
  const statusWeight = input.status === "revision_required" ? -3 : input.status === "awaiting_review" ? 4 : input.status === "available" ? -1 : 0;
  const kindWeight = input.kind.includes("quiz") ? -0.2 : 0;
  return due + (statusWeight + kindWeight) * 60_000;
}

export function humanizeAssessment(value: string | null | undefined) {
  if (!value) return "Not set";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
