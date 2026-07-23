export type StudentLifecycleInput = {
  studentStatus: string;
  enrollmentStatus?: string | null;
  onboardingStatus: string;
  orientationCompletedAt?: string | null;
  matriculatedAt?: string | null;
  portalAccountStatus?: string | null;
  handbookRequired?: boolean;
  handbookAcknowledged?: boolean;
};

export type StudentLifecycle = {
  academicStatus: string;
  overallOnboarding: string;
  portalAccess: string;
  handbook: string;
  orientation: string;
  matriculation: string;
  allRequiredMilestonesComplete: boolean;
};

const studentStatusLabels: Record<string, string> = {
  pending_onboarding: "Onboarding Pending",
  active: "Active Student",
  on_leave: "On Approved Leave",
  deferred: "Deferred",
  withdrawn: "Withdrawn",
  completed: "Programme Completed",
  suspended: "Suspended",
};

const terminalEnrollmentLabels: Record<string, string> = {
  on_leave: "On Approved Leave",
  deferred: "Deferred",
  withdrawn: "Withdrawn",
  completed: "Programme Completed",
  suspended: "Suspended",
  inactive: "Inactive",
};

function fallbackLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function deriveStudentLifecycle(input: StudentLifecycleInput): StudentLifecycle {
  const portalActive = input.portalAccountStatus === "active";
  const handbookComplete = !input.handbookRequired || input.handbookAcknowledged === true;
  const adminOnboardingComplete = input.onboardingStatus === "completed";
  const orientationComplete = Boolean(input.orientationCompletedAt);
  const matriculationComplete = Boolean(input.matriculatedAt);
  const allRequiredMilestonesComplete = portalActive
    && handbookComplete
    && adminOnboardingComplete
    && orientationComplete
    && matriculationComplete;

  let overallOnboarding = "Onboarding Pending";
  if (!portalActive) overallOnboarding = "Portal Access Pending";
  else if (!adminOnboardingComplete) overallOnboarding = input.onboardingStatus === "in_progress" ? "Onboarding In Progress" : "Onboarding Pending";
  else if (!handbookComplete) overallOnboarding = "Handbook Acknowledgement Pending";
  else if (!orientationComplete) overallOnboarding = "Orientation Pending";
  else if (!matriculationComplete) overallOnboarding = "Matriculation Pending";
  else overallOnboarding = "Completed";

  const terminalEnrollmentStatus = input.enrollmentStatus
    ? terminalEnrollmentLabels[input.enrollmentStatus]
    : undefined;
  const baseAcademicStatus = terminalEnrollmentStatus
    ?? studentStatusLabels[input.studentStatus]
    ?? fallbackLabel(input.studentStatus);

  let academicStatus = baseAcademicStatus;
  if (input.studentStatus === "active" && !terminalEnrollmentStatus) {
    academicStatus = allRequiredMilestonesComplete
      ? "Active Student"
      : `Active Student · ${overallOnboarding}`;
  }

  return {
    academicStatus,
    overallOnboarding,
    portalAccess: portalActive ? "Active" : "Pending",
    handbook: handbookComplete ? "Completed" : "Pending",
    orientation: orientationComplete ? "Completed" : "Pending",
    matriculation: matriculationComplete ? "Completed" : "Pending",
    allRequiredMilestonesComplete,
  };
}
