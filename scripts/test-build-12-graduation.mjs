import assert from "node:assert/strict";

import {
  announcementMatchesProgramme,
  canApproveGraduation,
  certificateClaimViolations,
  graduationEligibilityBlockingReasons,
  hasApprovedSignatureConfiguration,
  portalDestinationForRoles,
  recordingGrantIsActive,
  templateIssuanceBlockingReasons,
} from "../lib/lms/graduation.ts";

const eligible = { resultStatus: "published", resultOutcome: "eligible_for_completion", allGraduationGatesMet: true, mandatoryRequirementStatuses: ["met", "waived"], hasOpenIntegrityOrConductMatter: false, publishedResultMatchesApprovedBatch: true, hasUnresolvedResultCorrection: false };
assert.deepEqual(graduationEligibilityBlockingReasons(eligible), []);
assert.match(graduationEligibilityBlockingReasons({ ...eligible, resultStatus: "approved" })[0], /not been published/);
assert.match(graduationEligibilityBlockingReasons({ ...eligible, mandatoryRequirementStatuses: ["met", "not_met"] })[0], /mandatory/);
assert.match(graduationEligibilityBlockingReasons({ ...eligible, hasOpenIntegrityOrConductMatter: true })[0], /integrity or conduct/);
assert.equal(canApproveGraduation({ eligible: true, identityReconciled: false, academicRecordReconciled: true, status: "awaiting_approval", completionDate: "2026-08-30", decisionReference: "AC-1" }), false);
assert.equal(canApproveGraduation({ eligible: true, identityReconciled: true, academicRecordReconciled: false, status: "awaiting_approval", completionDate: "2026-08-30", decisionReference: "AC-1" }), false);
assert.equal(canApproveGraduation({ eligible: true, identityReconciled: true, academicRecordReconciled: true, status: "awaiting_approval", completionDate: "2026-08-30", decisionReference: "AC-1" }), true);

assert.ok(certificateClaimViolations("An internationally recognised accredited degree").length >= 3);
assert.equal(certificateClaimViolations("Successfully completed the REALMS School of Discovery programme").length, 0);
const signatures = [{ name: "Approved Person", role: "Authorised Signatory", asset_path: "institutional-awards/signatures/approved.png", approved: true }];
assert.equal(hasApprovedSignatureConfiguration(signatures), true);
assert.equal(hasApprovedSignatureConfiguration([]), false);
assert.equal(templateIssuanceBlockingReasons({ template_status: "approved", award_claim_text: "Successfully completed the REALMS School of Discovery programme", signature_configuration: signatures }).length, 0);
assert.ok(templateIssuanceBlockingReasons({ template_status: "draft", award_claim_text: "Accredited degree", signature_configuration: [] }).length >= 3);

assert.equal(announcementMatchesProgramme({ targetScope: "cohort", targetValue: "August 2026", cohortId: "cohort-1", cohortName: "August 2026", discipleshipRoute: "foundational", skillPathway: "web_development" }), true);
assert.equal(announcementMatchesProgramme({ targetScope: "skill_pathway", targetValue: "cybersecurity_foundations", cohortId: "cohort-1", discipleshipRoute: "foundational", skillPathway: "web_development" }), false);
assert.equal(recordingGrantIsActive({ accessStatus: "active", recordingStatus: "available", retentionStatus: "active", grantAvailableUntil: "2026-08-02T00:00:00Z", now: new Date("2026-08-01T00:00:00Z") }), true);
assert.equal(recordingGrantIsActive({ accessStatus: "active", recordingStatus: "available", retentionStatus: "active", grantAvailableUntil: "2026-07-31T00:00:00Z", now: new Date("2026-08-01T00:00:00Z") }), false);
assert.equal(recordingGrantIsActive({ accessStatus: "revoked", recordingStatus: "available", retentionStatus: "active" }), false);

assert.equal(portalDestinationForRoles({ roles: ["student", "alumni"], hasActiveStudentEnrollment: true }), "/student");
assert.equal(portalDestinationForRoles({ roles: ["student", "alumni"], hasActiveStudentEnrollment: false }), "/alumni");
assert.equal(portalDestinationForRoles({ roles: ["alumni"], hasActiveStudentEnrollment: false }), "/alumni");

console.log("Build 12 model tests passed (graduation blockers, reconciliation gates, truthful claims, signature controls, announcement targeting, recording expiry, and multi-role routing).");
