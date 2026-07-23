export const quizIntegrityDecisions = [
  "cleared",
  "warning_recorded",
  "attempt_voided",
  "replacement_granted",
  "confirmed_misconduct",
] as const;

export type QuizIntegrityDecision = (typeof quizIntegrityDecisions)[number];

export type QuizOrderQuestion = {
  id: string;
  question_type: string;
  options?: readonly unknown[] | null;
};

export type QuizAttemptOrderSnapshot = {
  questionOrder: string[];
  optionOrders: Record<string, number[]>;
};

export type RandomUnit = () => number;

function shuffled<T>(items: readonly T[], randomUnit: RandomUnit) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(Math.max(0, Math.min(0.999999999999, randomUnit())) * (index + 1));
    [result[index], result[selected]] = [result[selected], result[index]];
  }
  return result;
}

export function createQuizAttemptOrderSnapshot(
  questions: readonly QuizOrderQuestion[],
  settings: { randomizeQuestionOrder: boolean; randomizeOptionOrder: boolean },
  randomUnit: RandomUnit,
): QuizAttemptOrderSnapshot {
  const questionOrder = settings.randomizeQuestionOrder
    ? shuffled(questions.map((question) => question.id), randomUnit)
    : questions.map((question) => question.id);
  const optionOrders: Record<string, number[]> = {};
  for (const question of questions) {
    const optionCount = Array.isArray(question.options) ? question.options.length : 0;
    const storedOrder = Array.from({ length: optionCount }, (_, index) => index);
    optionOrders[question.id] = settings.randomizeOptionOrder && question.question_type === "multiple_choice"
      ? shuffled(storedOrder, randomUnit)
      : storedOrder;
  }
  return { questionOrder, optionOrders };
}

export function applyQuizAttemptOrder<T extends QuizOrderQuestion>(
  questions: readonly T[],
  snapshot: QuizAttemptOrderSnapshot,
) {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const ordered = snapshot.questionOrder.flatMap((id) => {
    const question = byId.get(id);
    return question ? [question] : [];
  });
  for (const question of questions) if (!snapshot.questionOrder.includes(question.id)) ordered.push(question);
  return ordered.map((question) => {
    if (!Array.isArray(question.options)) return question;
    const indices = snapshot.optionOrders[question.id] ?? question.options.map((_, index) => index);
    const options = indices.flatMap((index) => index >= 0 && index < question.options!.length ? [question.options![index]] : []);
    return { ...question, options };
  });
}

export function quizAnswerReviewEligibility(input: {
  permitsReview: boolean;
  reviewableAt?: string | null;
  now?: Date;
  hasActiveAttempt: boolean;
  hasAttemptUnderReview: boolean;
  hasPendingReplacement: boolean;
  hasAvailableNormalAttempt: boolean;
  hasCompletedOfficialAttempt: boolean;
}) {
  const reviewTime = input.reviewableAt ? Date.parse(input.reviewableAt) : Number.NaN;
  const now = (input.now ?? new Date()).valueOf();
  if (!input.permitsReview) return { eligible: false, reason: "review_disabled" } as const;
  if (!Number.isFinite(reviewTime) || reviewTime > now) return { eligible: false, reason: "review_time_pending" } as const;
  if (input.hasActiveAttempt) return { eligible: false, reason: "active_attempt" } as const;
  if (input.hasPendingReplacement) return { eligible: false, reason: "replacement_pending" } as const;
  if (input.hasAttemptUnderReview) return { eligible: false, reason: "integrity_review" } as const;
  if (input.hasAvailableNormalAttempt) return { eligible: false, reason: "attempt_available" } as const;
  if (!input.hasCompletedOfficialAttempt) return { eligible: false, reason: "no_completed_attempt" } as const;
  return { eligible: true, reason: "released" } as const;
}

export const defaultQuizTabPolicy = {
  monitoringEnabled: true,
  warningThreshold: 1,
  flagThreshold: 3,
  autoSubmitThreshold: null as number | null,
};

export function tabPolicyOutcome(input: {
  hiddenEventCount: number;
  monitoringEnabled: boolean;
  warningThreshold: number;
  flagThreshold: number;
  autoSubmitThreshold?: number | null;
}) {
  const count = Math.max(0, Math.floor(input.hiddenEventCount));
  if (!input.monitoringEnabled) return { warning: "none", flag: false, autoSubmit: false } as const;
  const autoSubmit = input.autoSubmitThreshold !== null
    && input.autoSubmitThreshold !== undefined
    && count >= input.autoSubmitThreshold;
  const flag = count >= input.flagThreshold;
  const warning = count < input.warningThreshold ? "none" : count === input.warningThreshold ? "first" : "repeated";
  return { warning, flag, autoSubmit } as const;
}

export function normalQuizAttemptsUsed(attempts: readonly { replacement_for_attempt_id?: string | null }[]) {
  return attempts.filter((attempt) => !attempt.replacement_for_attempt_id).length;
}

export function isOfficialQuizAttempt(attempt: {
  official_result_eligible?: boolean | null;
  integrity_status?: string | null;
}) {
  return attempt.official_result_eligible !== false
    && !["under_review", "confirmed_misconduct"].includes(String(attempt.integrity_status ?? "clear"));
}
