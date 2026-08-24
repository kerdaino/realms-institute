export type CohortCalendarConfiguration = {
  startDate: string | null;
  endDate: string | null;
  teachingStartDate: string | null;
  teachingEndDate: string | null;
  teachingWeekCount: number | null;
  completionPeriodStartDate: string | null;
  completionPeriodEndDate: string | null;
  orientationDate: string | null;
  orientationStartAt: string | null;
  matriculationDate: string | null;
  matriculationStartAt: string | null;
  graduationDate: string | null;
  graduationStartAt: string | null;
};

export function cohortCalendarValidationErrors(calendar: CohortCalendarConfiguration) {
  const errors: string[] = [];
  const lagosDate = (timestamp: string) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const ordered = (first: string | null, second: string | null, message: string) => {
    if (first && second && second < first) errors.push(message);
  };
  if ((calendar.teachingStartDate && !calendar.teachingEndDate) || (!calendar.teachingStartDate && calendar.teachingEndDate)) errors.push("Teaching start and teaching end must be configured together.");
  if ((calendar.completionPeriodStartDate && !calendar.completionPeriodEndDate) || (!calendar.completionPeriodStartDate && calendar.completionPeriodEndDate)) errors.push("Completion-period start and end must be configured together.");
  if (calendar.teachingWeekCount !== null && (!Number.isInteger(calendar.teachingWeekCount) || calendar.teachingWeekCount < 1 || calendar.teachingWeekCount > 52)) errors.push("Teaching-week count must be a whole number from 1 to 52.");
  if (calendar.teachingWeekCount !== null && (!calendar.teachingStartDate || !calendar.teachingEndDate)) errors.push("Teaching dates are required when a teaching-week count is set.");
  if (calendar.orientationStartAt && !calendar.orientationDate) errors.push("An orientation date is required when an orientation time is set.");
  if (calendar.matriculationStartAt && !calendar.matriculationDate) errors.push("A matriculation date is required when a matriculation time is set.");
  if (calendar.graduationStartAt && !calendar.graduationDate) errors.push("A graduation date is required when a graduation time is set.");
  if (calendar.orientationStartAt && calendar.orientationDate && lagosDate(calendar.orientationStartAt) !== calendar.orientationDate) errors.push("Orientation date and time must refer to the same date in Africa/Lagos.");
  if (calendar.matriculationStartAt && calendar.matriculationDate && lagosDate(calendar.matriculationStartAt) !== calendar.matriculationDate) errors.push("Matriculation date and time must refer to the same date in Africa/Lagos.");
  if (calendar.graduationStartAt && calendar.graduationDate && lagosDate(calendar.graduationStartAt) !== calendar.graduationDate) errors.push("Graduation date and time must refer to the same date in Africa/Lagos.");
  ordered(calendar.startDate, calendar.endDate, "Programme end must not be before programme start.");
  ordered(calendar.teachingStartDate, calendar.teachingEndDate, "Teaching end must not be before teaching start.");
  ordered(calendar.completionPeriodStartDate, calendar.completionPeriodEndDate, "Completion-period end must not be before its start.");
  if (calendar.startDate && calendar.teachingStartDate && calendar.teachingStartDate < calendar.startDate) errors.push("Teaching cannot begin before the programme start date.");
  if (calendar.teachingEndDate && calendar.completionPeriodStartDate && calendar.completionPeriodStartDate <= calendar.teachingEndDate) errors.push("The completion period must begin after teaching ends.");
  if (calendar.endDate && calendar.completionPeriodEndDate && calendar.completionPeriodEndDate > calendar.endDate) errors.push("The completion period cannot end after the programme end date.");
  if (calendar.graduationDate && calendar.completionPeriodEndDate && calendar.graduationDate <= calendar.completionPeriodEndDate) errors.push("Graduation must be after the completion period.");
  return errors;
}
