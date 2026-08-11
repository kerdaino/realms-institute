export const applicationStatuses = [
  "pending_review",
  "conditional_admission_payment_outstanding",
  "admitted",
  "admission_offer_lapsed_payment_outstanding",
  "contacted",
  "waitlisted",
  "not_admitted",
] as const;

export type ApplicationStatus = (typeof applicationStatuses)[number];

export const applicationStatusLabels: Record<ApplicationStatus, string> = {
  pending_review: "Pending Review",
  conditional_admission_payment_outstanding: "Conditional Admission — Payment Outstanding",
  admitted: "Admitted / Confirmed",
  admission_offer_lapsed_payment_outstanding: "Admission Offer Lapsed — Payment Outstanding",
  contacted: "Contacted",
  waitlisted: "Waitlisted",
  not_admitted: "Not Admitted",
};

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (applicationStatuses as readonly string[]).includes(value);
}
