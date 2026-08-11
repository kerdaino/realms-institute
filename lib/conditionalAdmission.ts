import { isFinancialRequirementSatisfied, scholarshipFinancialSummary } from "@/lib/scholarshipFinance";

export const conditionalAdmissionStatus = "conditional_admission_payment_outstanding" as const;
export const lapsedConditionalAdmissionStatus = "admission_offer_lapsed_payment_outstanding" as const;
export const august2026ClassStartAt = "2026-08-17T00:00:00+01:00";
export const conditionalAdmissionDeadlineDays = 14;

export type ConditionalAdmissionFinancialRecord = {
  amount: number;
  amount_paid?: number | null;
  payment_expected_amount?: number | null;
  payment_status?: string | null;
  financial_requirement_status?: string | null;
  funding_route?: string | null;
  scholarship_status?: string | null;
  scholarship_approved_amount?: number | null;
};

export function paymentDeadlineFromOffer(offerAt: string | Date) {
  const timestamp = offerAt instanceof Date ? offerAt.valueOf() : Date.parse(offerAt);
  if (!Number.isFinite(timestamp)) throw new Error("A valid admission offer timestamp is required.");
  return new Date(timestamp + conditionalAdmissionDeadlineDays * 24 * 60 * 60 * 1000).toISOString();
}

export function outstandingRegistrationAmount(record: ConditionalAdmissionFinancialRecord) {
  if (isFinancialRequirementSatisfied(record)) return 0;
  if (record.funding_route === "scholarship_request") {
    const summary = scholarshipFinancialSummary({
      normalFee: Number(record.amount),
      scholarshipStatus: record.scholarship_status || "",
      approvedScholarshipAmount: record.scholarship_approved_amount,
      amountPaid: record.amount_paid,
      paymentStatus: record.payment_status,
    });
    return summary.valid && summary.amountDue !== null ? summary.amountDue : null;
  }
  const expected = Number(record.payment_expected_amount);
  return Number.isFinite(expected) && expected > 0 ? expected : Number(record.amount) > 0 ? Number(record.amount) : null;
}

export function conditionalAdmissionEligibility(record: ConditionalAdmissionFinancialRecord & {
  assigned_discipleship_route?: string | null;
  skill_pathway?: string | null;
}) {
  if (!record.assigned_discipleship_route) return { eligible: false as const, reason: "Approve a discipleship route before issuing admission." };
  if (!record.skill_pathway) return { eligible: false as const, reason: "A skill pathway is required before issuing admission." };
  if (isFinancialRequirementSatisfied(record)) return { eligible: false as const, reason: "The financial requirement is already satisfied; use Admitted / Confirmed." };
  const outstandingAmount = outstandingRegistrationAmount(record);
  if (!outstandingAmount) return { eligible: false as const, reason: "The exact outstanding registration amount could not be established safely." };
  return { eligible: true as const, outstandingAmount };
}

export function shouldFlagLateEntry(paidAt: string | null | undefined) {
  return Boolean(paidAt && Date.parse(paidAt) >= Date.parse(august2026ClassStartAt));
}
