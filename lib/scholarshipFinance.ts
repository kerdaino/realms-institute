export const financialRequirementStatuses = [
  "payment_required",
  "satisfied_by_payment",
  "satisfied_by_scholarship",
] as const;

export type FinancialRequirementStatus = (typeof financialRequirementStatuses)[number];

export type ScholarshipFinancialSummary = {
  valid: boolean;
  normalFee: number;
  approvedSupport: number | null;
  amountDue: number | null;
  financialRequirementStatus: FinancialRequirementStatus;
};

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

export function scholarshipFinancialSummary(input: {
  normalFee: number;
  scholarshipStatus: string;
  approvedScholarshipAmount: number | null | undefined;
  amountPaid?: number | null;
  paymentStatus?: string | null;
}): ScholarshipFinancialSummary {
  const normalFee = money(input.normalFee);
  const approvedSupport = money(input.approvedScholarshipAmount);
  const amountPaid = money(input.amountPaid) ?? 0;

  if (normalFee === null || normalFee <= 0) {
    return { valid: false, normalFee: 0, approvedSupport, amountDue: null, financialRequirementStatus: "payment_required" };
  }

  if (input.scholarshipStatus === "approved_full") {
    const valid = approvedSupport === normalFee;
    return {
      valid,
      normalFee,
      approvedSupport,
      amountDue: valid ? 0 : null,
      financialRequirementStatus: valid ? "satisfied_by_scholarship" : "payment_required",
    };
  }

  if (input.scholarshipStatus === "approved_partial") {
    const valid = approvedSupport !== null && approvedSupport > 0 && approvedSupport < normalFee;
    const amountDue = valid ? Math.round((normalFee - approvedSupport) * 100) / 100 : null;
    const satisfied = valid && input.paymentStatus === "success" && amountPaid >= amountDue!;
    return {
      valid,
      normalFee,
      approvedSupport,
      amountDue,
      financialRequirementStatus: satisfied ? "satisfied_by_payment" : "payment_required",
    };
  }

  if (input.scholarshipStatus === "declined") {
    const satisfied = input.paymentStatus === "success" && amountPaid >= normalFee;
    return {
      valid: true,
      normalFee,
      approvedSupport: 0,
      amountDue: normalFee,
      financialRequirementStatus: satisfied ? "satisfied_by_payment" : "payment_required",
    };
  }

  return {
    valid: true,
    normalFee,
    approvedSupport: null,
    amountDue: null,
    financialRequirementStatus: input.paymentStatus === "success" && amountPaid >= normalFee
      ? "satisfied_by_payment"
      : "payment_required",
  };
}

export function isFinancialRequirementSatisfied(value: {
  financial_requirement_status?: string | null;
  funding_route?: string | null;
  scholarship_status?: string | null;
  payment_status?: string | null;
  amount?: number | null;
  amount_paid?: number | null;
  scholarship_approved_amount?: number | null;
}) {
  if (value.financial_requirement_status === "satisfied_by_payment" || value.financial_requirement_status === "satisfied_by_scholarship") return true;
  if (value.funding_route === "scholarship_request") {
    return scholarshipFinancialSummary({
      normalFee: Number(value.amount),
      scholarshipStatus: value.scholarship_status || "",
      approvedScholarshipAmount: value.scholarship_approved_amount,
      amountPaid: value.amount_paid,
      paymentStatus: value.payment_status,
    }).financialRequirementStatus !== "payment_required";
  }
  return value.payment_status === "success" && Number(value.amount_paid) >= Number(value.amount);
}
