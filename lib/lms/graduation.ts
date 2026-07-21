export const graduationConfirmationStatuses = ["draft", "eligible", "reconciliation_required", "awaiting_approval", "approved", "completed", "cancelled"] as const;
export const awardStatuses = ["draft", "approved", "issued", "superseded", "revoked"] as const;
export const awardDocumentStatuses = ["not_generated", "generation_pending", "generated", "generation_failed"] as const;
export const announcementScopes = ["all_alumni", "cohort", "discipleship_route", "skill_pathway"] as const;
export const announcementTypes = ["general", "further_training", "advanced_programme", "event", "service_opportunity", "career_or_project_opportunity", "institutional_update"] as const;
export const alumniOutcomeTypes = ["employment", "business_project", "ministry_service", "mission_activity", "further_study", "community_impact", "practical_skill_application"] as const;

export const institutionalAwardTitle = "REALMS Institutional Certificate of Completion and Competence";
export const institutionalAwardType = "institutional_certificate_of_completion_competence";
export const awardingInstitution = "REALMS Institute";
export const awardDisclaimer = "This is a REALMS institutional certificate. It must not be represented as a degree, national diploma, government accreditation or professional licence.";

const prohibitedAwardClaims = [
  /\baccredited\b/i,
  /\bdegree\b/i,
  /\bnational\s+diploma\b/i,
  /\bgovernment\s+(?:approved|accredit(?:ed|ation))\b/i,
  /\binternationally\s+recognised\b/i,
  /\bprofessional\s+licen[cs]e\b/i,
  /\bHND\b/,
  /\bNCE\b/,
];

export type EligibilityEvidence = {
  resultStatus: string | null;
  resultOutcome: string | null;
  allGraduationGatesMet: boolean;
  mandatoryRequirementStatuses: readonly string[];
  hasOpenIntegrityOrConductMatter: boolean;
  publishedResultMatchesApprovedBatch: boolean;
  hasUnresolvedResultCorrection: boolean;
};

export function graduationEligibilityBlockingReasons(input: EligibilityEvidence) {
  const reasons: string[] = [];
  if (input.resultStatus !== "published") reasons.push("The programme result has not been published.");
  if (input.resultOutcome !== "eligible_for_completion") reasons.push("The published result is not eligible for completion.");
  if (!input.allGraduationGatesMet) reasons.push("Not all graduation gates are met.");
  if (input.mandatoryRequirementStatuses.some((status) => !["met", "waived", "not_applicable"].includes(status))) reasons.push("One or more mandatory graduation requirements remain unresolved.");
  if (input.hasOpenIntegrityOrConductMatter) reasons.push("An integrity or conduct review remains unresolved.");
  if (!input.publishedResultMatchesApprovedBatch) reasons.push("The published result is not the current approved batch result.");
  if (input.hasUnresolvedResultCorrection) reasons.push("A result correction remains unresolved or requires republication.");
  return reasons;
}

export function isGraduationEligible(input: EligibilityEvidence) {
  return graduationEligibilityBlockingReasons(input).length === 0;
}

export function canApproveGraduation(input: {
  eligible: boolean;
  identityReconciled: boolean;
  academicRecordReconciled: boolean;
  status: string;
  completionDate?: string | null;
  decisionReference?: string | null;
}) {
  return input.eligible && input.identityReconciled && input.academicRecordReconciled && input.status === "awaiting_approval" && Boolean(input.completionDate) && Boolean(input.decisionReference?.trim());
}

export function certificateClaimViolations(claim: string) {
  return prohibitedAwardClaims.filter((pattern) => pattern.test(claim)).map((pattern) => pattern.source);
}

export function hasApprovedSignatureConfiguration(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const item = entry as Record<string, unknown>;
    return typeof item.name === "string" && item.name.trim().length > 1
      && typeof item.role === "string" && item.role.trim().length > 1
      && typeof item.asset_path === "string" && item.asset_path.trim().length > 1
      && item.approved === true;
  });
}

export function templateIssuanceBlockingReasons(template: Record<string, unknown> | null) {
  if (!template) return ["No certificate template is configured."];
  const reasons: string[] = [];
  if (template.template_status !== "approved") reasons.push("The certificate template is not approved.");
  const claim = typeof template.award_claim_text === "string" ? template.award_claim_text.trim() : "";
  if (!claim) reasons.push("The certificate claim text is missing.");
  if (claim && certificateClaimViolations(claim).length) reasons.push("The certificate claim contains a prohibited qualification or accreditation statement.");
  if (!hasApprovedSignatureConfiguration(template.signature_configuration)) reasons.push("Approved signatories and signature assets are not configured.");
  return reasons;
}

export function announcementMatchesProgramme(input: {
  targetScope: string;
  targetValue?: string | null;
  cohortId: string;
  cohortName?: string | null;
  discipleshipRoute: string;
  skillPathway: string;
}) {
  if (input.targetScope === "all_alumni") return true;
  const target = input.targetValue?.trim().toLowerCase();
  if (!target) return false;
  if (input.targetScope === "cohort") return [input.cohortId, input.cohortName].some((value) => value?.toLowerCase() === target);
  if (input.targetScope === "discipleship_route") return input.discipleshipRoute.toLowerCase() === target;
  if (input.targetScope === "skill_pathway") return input.skillPathway.toLowerCase() === target;
  return false;
}

export function recordingGrantIsActive(input: {
  accessStatus: string;
  grantAvailableFrom?: string | null;
  grantAvailableUntil?: string | null;
  recordingStatus: string;
  retentionStatus: string;
  recordingAvailableFrom?: string | null;
  recordingAvailableUntil?: string | null;
  now?: Date;
}) {
  const now = (input.now ?? new Date()).valueOf();
  const hasStarted = (value?: string | null) => !value || new Date(value).valueOf() <= now;
  const hasNotEnded = (value?: string | null) => !value || new Date(value).valueOf() > now;
  return input.accessStatus === "active"
    && input.recordingStatus === "available"
    && input.retentionStatus === "active"
    && hasStarted(input.grantAvailableFrom)
    && hasNotEnded(input.grantAvailableUntil)
    && hasStarted(input.recordingAvailableFrom)
    && hasNotEnded(input.recordingAvailableUntil);
}

export function portalDestinationForRoles(input: { roles: readonly string[]; hasActiveStudentEnrollment: boolean }) {
  if (input.roles.includes("admin")) return "/admin";
  if (input.roles.includes("facilitator")) return "/facilitator";
  if (input.roles.includes("mentor")) return "/mentor";
  if (input.roles.includes("student") && input.hasActiveStudentEnrollment) return "/student";
  if (input.roles.includes("alumni")) return "/alumni";
  if (input.roles.includes("student")) return "/student";
  return "/portal/access-pending";
}
