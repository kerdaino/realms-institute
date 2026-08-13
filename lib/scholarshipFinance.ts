export const financialRequirementStatuses = [
  "payment_required",
  "satisfied_by_payment",
  "satisfied_by_scholarship",
] as const;

export type FinancialRequirementStatus = (typeof financialRequirementStatuses)[number];

export type ScholarshipFinancialSummary = {
  valid: boolean;
  reason: string | null;
  normalFee: number;
  approvedSupport: number | null;
  amountDue: number | null;
  verifiedAmountPaid: number;
  remainingDue: number | null;
  requiresManualPaymentReview: boolean;
  financialRequirementStatus: FinancialRequirementStatus;
};

export type RegistrationFinancialSummary = ScholarshipFinancialSummary;

const supportedPaymentCurrencies = new Set(["NGN"]);

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

function invalidFinancialSummary(normalFee: number, approvedSupport: number | null, reason: string): RegistrationFinancialSummary {
  return {
    valid: false,
    reason,
    normalFee,
    approvedSupport,
    amountDue: null,
    verifiedAmountPaid: 0,
    remainingDue: null,
    requiresManualPaymentReview: true,
    financialRequirementStatus: "payment_required",
  };
}

export function registrationFinancialSummary(input: {
  normalFee: number;
  currency?: string | null;
  fundingRoute: string;
  scholarshipStatus: string;
  approvedScholarshipAmount: number | null | undefined;
  amountPaid?: number | null;
  paymentStatus?: string | null;
  financialRequirementStatus?: string | null;
}): RegistrationFinancialSummary {
  const normalFee = money(input.normalFee);
  const approvedSupport = money(input.approvedScholarshipAmount);
  const savedAmountPaid = input.amountPaid === null || input.amountPaid === undefined ? 0 : money(input.amountPaid);

  if (normalFee === null || normalFee <= 0) {
    return invalidFinancialSummary(0, approvedSupport, "The normal registration fee is missing or invalid.");
  }
  if (input.currency && !supportedPaymentCurrencies.has(input.currency.trim().toUpperCase())) {
    return invalidFinancialSummary(normalFee, approvedSupport, "The saved registration currency is not supported for secure payment.");
  }
  if (savedAmountPaid === null || savedAmountPaid < 0) {
    return invalidFinancialSummary(normalFee, approvedSupport, "The saved payment amount is invalid.");
  }

  let amountDue: number;
  let coverage: "payment" | "scholarship" = "payment";
  if (input.fundingRoute === "self_pay") {
    if (input.scholarshipStatus && input.scholarshipStatus !== "not_requested") {
      return invalidFinancialSummary(normalFee, approvedSupport, "The funding route and scholarship decision are inconsistent.");
    }
    if (approvedSupport !== null && approvedSupport !== 0) {
      return invalidFinancialSummary(normalFee, approvedSupport, "Self-pay registration cannot contain approved scholarship support.");
    }
    amountDue = normalFee;
  } else if (input.fundingRoute !== "scholarship_request") {
    return invalidFinancialSummary(normalFee, approvedSupport, "The saved funding route is not supported.");
  } else if (input.scholarshipStatus === "approved_full") {
    if (approvedSupport !== normalFee) {
      return invalidFinancialSummary(normalFee, approvedSupport, "Approved full scholarship support must equal the normal registration fee.");
    }
    amountDue = 0;
    coverage = "scholarship";
  } else if (input.scholarshipStatus === "approved_partial") {
    if (approvedSupport === null || approvedSupport <= 0 || approvedSupport >= normalFee) {
      return invalidFinancialSummary(normalFee, approvedSupport, "Approved partial scholarship support must be greater than zero and less than the normal registration fee.");
    }
    amountDue = Math.round((normalFee - approvedSupport) * 100) / 100;
  } else if (input.scholarshipStatus === "declined") {
    if (approvedSupport !== null && approvedSupport !== 0) {
      return invalidFinancialSummary(normalFee, approvedSupport, "A declined scholarship request cannot contain approved scholarship support.");
    }
    amountDue = normalFee;
  } else {
    return invalidFinancialSummary(normalFee, approvedSupport, "The scholarship decision does not yet establish an amount due.");
  }

  if (coverage === "scholarship" && savedAmountPaid > 0) {
    return invalidFinancialSummary(normalFee, approvedSupport, "A fully covered scholarship application contains contradictory payment data.");
  }

  const paymentStatus = input.paymentStatus || "not_paid";
  const paymentRecorded = paymentStatus === "success" || paymentStatus === "underpayment";
  if (savedAmountPaid > 0 && !paymentRecorded) {
    return invalidFinancialSummary(normalFee, approvedSupport, "The saved amount paid is inconsistent with the payment status.");
  }
  const verifiedAmountPaid = coverage === "payment" && paymentRecorded ? savedAmountPaid : 0;
  const remainingDue = Math.max(Math.round((amountDue - verifiedAmountPaid) * 100) / 100, 0);
  const requiresManualPaymentReview = paymentStatus === "underpayment" || paymentStatus === "currency_mismatch" || (paymentStatus === "success" && remainingDue > 0);
  const financialRequirementStatus: FinancialRequirementStatus = coverage === "scholarship"
    ? "satisfied_by_scholarship"
    : remainingDue === 0
      ? "satisfied_by_payment"
      : "payment_required";
  if (
    input.financialRequirementStatus
    && (financialRequirementStatuses as readonly string[]).includes(input.financialRequirementStatus)
    && input.financialRequirementStatus !== financialRequirementStatus
  ) {
    return invalidFinancialSummary(normalFee, approvedSupport, "The saved financial requirement conflicts with the canonical fee and verified payment evidence.");
  }

  return {
    valid: true,
    reason: null,
    normalFee,
    approvedSupport: input.fundingRoute === "scholarship_request" ? approvedSupport ?? 0 : null,
    amountDue,
    verifiedAmountPaid,
    remainingDue,
    requiresManualPaymentReview,
    financialRequirementStatus,
  };
}

export function scholarshipFinancialSummary(input: {
  normalFee: number;
  scholarshipStatus: string;
  approvedScholarshipAmount: number | null | undefined;
  amountPaid?: number | null;
  paymentStatus?: string | null;
}): ScholarshipFinancialSummary {
  if (!["approved_full", "approved_partial", "declined"].includes(input.scholarshipStatus)) {
    const normalFee = money(input.normalFee);
    const paid = money(input.amountPaid) ?? 0;
    const satisfied = normalFee !== null && normalFee > 0 && input.paymentStatus === "success" && paid >= normalFee;
    return {
      valid: normalFee !== null && normalFee > 0,
      reason: normalFee !== null && normalFee > 0 ? null : "The normal registration fee is missing or invalid.",
      normalFee: normalFee ?? 0,
      approvedSupport: null,
      amountDue: null,
      verifiedAmountPaid: satisfied ? paid : 0,
      remainingDue: null,
      requiresManualPaymentReview: false,
      financialRequirementStatus: satisfied ? "satisfied_by_payment" : "payment_required",
    };
  }
  return registrationFinancialSummary({
    ...input,
    currency: "NGN",
    fundingRoute: "scholarship_request",
  });
}

export function isFinancialRequirementSatisfied(value: {
  financial_requirement_status?: string | null;
  funding_route?: string | null;
  scholarship_status?: string | null;
  payment_status?: string | null;
  currency?: string | null;
  amount?: number | null;
  amount_paid?: number | null;
  scholarship_approved_amount?: number | null;
}) {
  const summary = registrationFinancialSummary({
    normalFee: Number(value.amount),
    currency: value.currency || "NGN",
    fundingRoute: value.funding_route || "self_pay",
    scholarshipStatus: value.scholarship_status || (value.funding_route === "scholarship_request" ? "" : "not_requested"),
    approvedScholarshipAmount: value.scholarship_approved_amount,
    amountPaid: value.amount_paid,
    paymentStatus: value.payment_status,
    financialRequirementStatus: value.financial_requirement_status,
  });
  return summary.valid && summary.financialRequirementStatus !== "payment_required";
}
