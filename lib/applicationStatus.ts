export const applicationStatuses = ["pending_review", "admitted", "contacted", "waitlisted", "not_admitted"] as const;

export type ApplicationStatus = (typeof applicationStatuses)[number];

export const applicationStatusLabels: Record<ApplicationStatus, string> = {
  pending_review: "Pending Review",
  admitted: "Admitted",
  contacted: "Contacted",
  waitlisted: "Waitlisted",
  not_admitted: "Not Admitted",
};

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (applicationStatuses as readonly string[]).includes(value);
}
