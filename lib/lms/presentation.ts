const institutionalValueLabels: Record<string, string> = {
  pending_onboarding: "Onboarding Pending",
  approved_partial: "Partially Approved",
  not_required: "Not Required",
  awaiting_review: "Awaiting Review",
  under_review: "Under Review",
  counts_toward_result: "Included in Programme Result",
  content_pending: "Content Not Yet Available",
  draft_unpublished: "Draft — Not Published",
  not_applicable: "Not Applicable",
  not_started: "Not Started",
  in_progress: "In Progress",
  awaiting_checkpoint: "Checkpoint Pending",
  awaiting_quiz: "Quiz Pending",
  awaiting_practical: "Practical Pending",
  awaiting_reflection: "Reflection Pending",
  awaiting_oral_verification: "Oral Verification Pending",
  verified_complete: "Completed",
  late_complete: "Completed After Deadline",
  integrity_review: "Academic Integrity Review",
  under_integrity_review: "Academic Integrity Review",
  eligible_for_completion: "Eligible for Final Completion Review",
  not_yet_eligible: "Not Yet Eligible for Completion",
  review_required: "Review Required",
  more_information_required: "More Information Required",
  reschedule_required: "Rescheduling Required",
  submitted_for_approval: "Submitted for Approval",
  submitted_for_review: "Submitted for Review",
};

export function institutionalValueLabel(value: string | null | undefined, fallback = "Not Available") {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return institutionalValueLabels[normalized]
    ?? normalized.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
