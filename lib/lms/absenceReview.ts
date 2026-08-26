export const absenceReviewDecisions = ["approve", "decline", "request_information"] as const;

export type AbsenceReviewDecision = (typeof absenceReviewDecisions)[number];

export const invalidAbsenceReviewDecisionMessage =
  "Choose a valid absence review action: approve, decline, or request information.";

const routeSuffix: Record<AbsenceReviewDecision, string> = {
  approve: "approve",
  decline: "decline",
  request_information: "request-information",
};

export function isAbsenceReviewDecision(value: unknown): value is AbsenceReviewDecision {
  return typeof value === "string" && (absenceReviewDecisions as readonly string[]).includes(value);
}

export class AbsenceReviewDecisionValidationError extends Error {
  readonly status = 400;

  constructor() {
    super(invalidAbsenceReviewDecisionMessage);
    this.name = "AbsenceReviewDecisionValidationError";
  }
}

export function absenceReviewDecisionEndpoint(requestId: string, decision: unknown) {
  if (!isAbsenceReviewDecision(decision)) throw new AbsenceReviewDecisionValidationError();
  return `/api/admin/absence-makeup/${encodeURIComponent(requestId)}/${routeSuffix[decision]}`;
}
