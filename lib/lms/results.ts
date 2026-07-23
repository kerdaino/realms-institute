export const resultOutcomes = [
  "eligible_for_completion",
  "not_yet_eligible",
  "incomplete",
  "resit_required",
  "deferred_result",
  "failed",
  "withheld",
  "under_review",
] as const;

export const resultStatuses = [
  "draft",
  "calculated",
  "review_required",
  "submitted_for_approval",
  "approved",
  "published",
  "withheld",
  "corrected",
] as const;

export const graduationRequirementStatuses = ["pending", "met", "not_met", "under_review", "waived", "not_applicable"] as const;
export const engagementEvaluationStatuses = ["pending", "evaluated", "moderated", "approved"] as const;
export const attemptSelections = ["best_graded", "latest_graded", "first_graded"] as const;
export const defenceStatuses = ["not_scheduled", "scheduled", "completed", "reschedule_required", "cancelled"] as const;
export const defenceOutcomes = ["passed", "revision_required", "not_passed"] as const;
export const resultBatchStatuses = ["draft", "prepared", "submitted_for_review", "reviewed", "approved", "published", "withdrawn"] as const;

export type ResultOutcome = (typeof resultOutcomes)[number];
export type ResultStatus = (typeof resultStatuses)[number];
export type GraduationRequirementStatus = (typeof graduationRequirementStatuses)[number];
export type EngagementEvaluationStatus = (typeof engagementEvaluationStatuses)[number];
export type AttemptSelection = (typeof attemptSelections)[number];

export type AssessmentAttemptEvidence = {
  id: string;
  attemptNumber: number;
  status: string;
  scorePercentage: number | null;
  gradedAt: string | null;
  accepted?: boolean;
};

export type WeightedAssessmentEvidence = {
  assessmentType: "assignment" | "quiz";
  assessmentId: string;
  title: string;
  weightUnits: number;
  attemptSelection: AttemptSelection;
  required: boolean;
  attempts: readonly AssessmentAttemptEvidence[];
};

export type SelectedAssessmentEvidence = {
  assessmentType: "assignment" | "quiz";
  assessmentId: string;
  title: string;
  weightUnits: number;
  required: boolean;
  selectedAttemptId: string | null;
  selectedAttemptNumber: number | null;
  scorePercentage: number | null;
  evidenceStatus: "complete" | "missing" | "review_required";
};

function round(value: number, places = 2) {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export function isAttemptUnderReview(status: string) {
  return ["awaiting_review", "under_integrity_review", "integrity_review", "submitted"].includes(status);
}

export function selectGradedAttempt(attempts: readonly AssessmentAttemptEvidence[], selection: AttemptSelection) {
  const eligible = attempts.filter((attempt) => attempt.status === "graded" && attempt.scorePercentage !== null && attempt.accepted !== false);
  if (!eligible.length) return null;
  if (selection === "best_graded") return [...eligible].sort((a, b) => Number(b.scorePercentage) - Number(a.scorePercentage) || b.attemptNumber - a.attemptNumber)[0];
  if (selection === "first_graded") return [...eligible].sort((a, b) => a.attemptNumber - b.attemptNumber)[0];
  return [...eligible].sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
}

export function calculateWeightedAssessmentCategory(input: {
  maximumPoints: number;
  assessments: readonly WeightedAssessmentEvidence[];
}) {
  const evidence: SelectedAssessmentEvidence[] = input.assessments.map((assessment) => {
    const selected = selectGradedAttempt(assessment.attempts, assessment.attemptSelection);
    const reviewRequired = !selected && assessment.attempts.some((attempt) => isAttemptUnderReview(attempt.status));
    return {
      assessmentType: assessment.assessmentType,
      assessmentId: assessment.assessmentId,
      title: assessment.title,
      weightUnits: assessment.weightUnits,
      required: assessment.required,
      selectedAttemptId: selected?.id ?? null,
      selectedAttemptNumber: selected?.attemptNumber ?? null,
      scorePercentage: selected?.scorePercentage ?? null,
      evidenceStatus: selected ? "complete" : reviewRequired ? "review_required" : "missing",
    };
  });
  const usable = evidence.filter((item) => item.scorePercentage !== null && item.weightUnits > 0);
  const weightTotal = usable.reduce((sum, item) => sum + item.weightUnits, 0);
  const rawPercentage = weightTotal > 0
    ? round(usable.reduce((sum, item) => sum + Number(item.scorePercentage) * item.weightUnits, 0) / weightTotal)
    : null;
  const weightedPoints = rawPercentage === null ? null : round(rawPercentage / 100 * input.maximumPoints);
  const requiredIncomplete = evidence.some((item) => item.required && item.evidenceStatus !== "complete");
  const reviewRequired = evidence.some((item) => item.required && item.evidenceStatus === "review_required");
  return {
    rawPercentage,
    weightedPoints,
    evidenceComplete: !requiredIncomplete && usable.length > 0,
    calculationStatus: reviewRequired ? "review_required" : requiredIncomplete || !usable.length ? "incomplete_evidence" : "calculated",
    evidence,
  } as const;
}

export type AttendanceScoreRecord = {
  id: string;
  required: boolean;
  cancelled: boolean;
  finalized: boolean;
  status: string;
};

export function calculateAttendanceComponent(input: {
  maximumPoints: number;
  records: readonly AttendanceScoreRecord[];
  creditMapping: Record<string, number | null>;
}) {
  const relevant = input.records.filter((record) => record.required && !record.cancelled);
  let earnedCredits = 0;
  let eligibleCredits = 0;
  const unresolved: string[] = [];
  for (const record of relevant) {
    const credit = input.creditMapping[record.status];
    if (!record.finalized || credit === undefined || (credit === null && record.status !== "excused_absence")) {
      unresolved.push(record.id);
      continue;
    }
    if (record.status === "excused_absence") continue;
    eligibleCredits += 1;
    earnedCredits += credit ?? 0;
  }
  const rawPercentage = eligibleCredits > 0 ? round(earnedCredits / eligibleCredits * 100) : null;
  const weightedPoints = rawPercentage === null ? null : round(rawPercentage / 100 * input.maximumPoints);
  return {
    rawPercentage,
    weightedPoints,
    earnedCredits: round(earnedCredits),
    eligibleCredits,
    unresolvedRecordIds: unresolved,
    evidenceComplete: relevant.length > 0 && unresolved.length === 0,
    calculationStatus: unresolved.length ? "review_required" : relevant.length && eligibleCredits > 0 ? "calculated" : "incomplete_evidence",
  } as const;
}

export type GraduationGateValues = {
  totalPoints: number | null;
  discipleshipPoints: number | null;
  skillPoints: number | null;
  engagementPoints: number | null;
  overallMinimum: number;
  discipleshipMinimum: number;
  skillMinimum: number;
  engagementMinimum: number;
  evidenceComplete: boolean;
  requirements: readonly { mandatory: boolean; status: GraduationRequirementStatus }[];
};

export function evaluateProgrammeEligibility(input: GraduationGateValues) {
  const scoreGates = {
    overall: input.totalPoints !== null && input.totalPoints >= input.overallMinimum,
    discipleship: input.discipleshipPoints !== null && input.discipleshipPoints >= input.discipleshipMinimum,
    skill: input.skillPoints !== null && input.skillPoints >= input.skillMinimum,
    engagement: input.engagementPoints !== null && input.engagementPoints >= input.engagementMinimum,
  };
  const underReview = input.requirements.some((requirement) => requirement.mandatory && requirement.status === "under_review");
  const requirementsMet = input.requirements.every((requirement) => !requirement.mandatory || ["met", "waived", "not_applicable"].includes(requirement.status));
  const allGatesMet = Object.values(scoreGates).every(Boolean) && requirementsMet && input.evidenceComplete;
  const outcome: ResultOutcome = underReview ? "under_review" : !input.evidenceComplete ? "incomplete" : allGatesMet ? "eligible_for_completion" : "not_yet_eligible";
  return { scoreGates, requirementsMet, allGatesMet, outcome };
}

export function humanizeResult(value: string | null | undefined) {
  if (!value) return "Not Set";
  const labels: Record<string, string> = {
    eligible_for_completion: "Eligible for Final Completion Review",
    not_yet_eligible: "Not Yet Eligible for Completion",
    review_required: "Review Required",
    under_review: "Under Review",
  };
  return labels[value] ?? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeSkillPathway(value: string | null | undefined) {
  return value === "cybersecurity" ? "cybersecurity_foundations" : value ?? "";
}

export function assessmentMatchesStudentProgramme(input: {
  courseCategory: string;
  courseDiscipleshipRoute?: string | null;
  courseSkillPathway?: string | null;
  studentDiscipleshipRoute: string;
  studentSkillPathway: string;
}) {
  if (input.courseCategory === "discipleship") return !input.courseDiscipleshipRoute || input.courseDiscipleshipRoute === input.studentDiscipleshipRoute;
  if (input.courseCategory === "skill") return !input.courseSkillPathway || normalizeSkillPathway(input.courseSkillPathway) === normalizeSkillPathway(input.studentSkillPathway);
  return false;
}

export function isStudentVisibleResult(status: string | null | undefined) {
  return status === "published";
}
