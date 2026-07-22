export const august2026CohortCode = "RSD-AUG-2026";
export const august2026Timezone = "Africa/Lagos";
export const august2026PhysicalLocation = "No. 3 Shina Olaogun Street, Agbado, Ogun State.";

export const august2026CohortDates = {
  startDate: "2026-08-24",
  endDate: "2026-10-25",
  orientationDate: "2026-08-21",
  matriculationDate: "2026-08-21",
  finalCompletionStartDate: "2026-10-19",
  finalCompletionEndDate: "2026-10-24",
  graduationDate: "2026-10-25",
  graduationTime: null,
} as const;

export type August2026Session = {
  courseCode: string;
  route: "foundational" | "advanced" | "web" | "cyber";
  week: number;
  title: string;
  description: string;
  sessionNumber: number;
  sessionType: "teaching" | "prayer" | "review" | "practical" | "assessment";
  deliveryMode: "online" | "hybrid";
  scheduledStartAt: string;
  scheduledEndAt: string;
  timezone: typeof august2026Timezone;
  facilitatorName: string | null;
  liveJoinUrl: null;
  physicalLocation: string | null;
  sessionStatus: "scheduled";
  visibilityStatus: "enrolled_only";
  isRequired: true;
};

function wat(date: string, time: string) {
  return new Date(`${date}T${time}:00+01:00`).toISOString();
}

function session(input: Omit<August2026Session, "timezone" | "liveJoinUrl" | "sessionStatus" | "visibilityStatus" | "isRequired">): August2026Session {
  return { ...input, timezone: august2026Timezone, liveJoinUrl: null, sessionStatus: "scheduled", visibilityStatus: "enrolled_only", isRequired: true };
}

const foundational = [
  { code: "RSD-DIS 101", week: 1, short: "Soteriology I", dates: ["2026-08-28", "2026-08-29", "2026-08-30"], facilitator: "Pastor Arome Iduh" },
  { code: "RSD-DIS 102", week: 2, short: "Soteriology II", dates: ["2026-09-04", "2026-09-05", "2026-09-06"], facilitator: "Pastor Arome Iduh" },
  { code: "RSD-DIS 103", week: 3, short: "Spiritual Formation", dates: ["2026-09-11", "2026-09-12", "2026-09-13"], facilitator: "Otache Imanche" },
  { code: "RSD-DIS 104", week: 4, short: "Purpose and Calling", dates: ["2026-09-18", "2026-09-19", "2026-09-20"], facilitator: "Pastor Onyeka" },
  { code: "RSD-DIS 105", week: 5, short: "Kingdom Leadership and Character", dates: ["2026-09-25", "2026-09-26", "2026-09-27"], facilitator: "Minister Daniel" },
  { code: "RSD-DIS 106", week: 6, short: "Kingdom Finance and Stewardship", dates: ["2026-10-02", "2026-10-03", "2026-10-04"], facilitator: "Minister Daniel" },
  { code: "RSD-DIS 107", week: 7, short: "Missions and Evangelism", dates: ["2026-10-09", "2026-10-10", "2026-10-11"], facilitator: "Oluwatobi Adekunle" },
  { code: "RSD-DIS 108", week: 8, short: "Integration, Assessment and Commissioning", dates: ["2026-10-16", "2026-10-17", "2026-10-18"], facilitator: "REALMS Faculty Team" },
] as const;

const foundationalSessions = foundational.flatMap((item) => [
  session({ courseCode: item.code, route: "foundational", week: item.week, title: `Week ${item.week} — ${item.short} — Friday Teaching`, description: "Foundational discipleship teaching session.", sessionNumber: 1, sessionType: "teaching", deliveryMode: "online", scheduledStartAt: wat(item.dates[0], "18:30"), scheduledEndAt: wat(item.dates[0], "20:30"), facilitatorName: item.facilitator, physicalLocation: null }),
  session({ courseCode: item.code, route: "foundational", week: item.week, title: `Week ${item.week} — ${item.short} — Saturday Teaching & Application`, description: "Foundational discipleship teaching and application session.", sessionNumber: 2, sessionType: "teaching", deliveryMode: "online", scheduledStartAt: wat(item.dates[1], "18:30"), scheduledEndAt: wat(item.dates[1], "20:30"), facilitatorName: item.facilitator, physicalLocation: null }),
  session({ courseCode: item.code, route: "foundational", week: item.week, title: `Week ${item.week} — ${item.short} — Sunday Prayer & Q&A`, description: "One hour of prayer followed by thirty minutes of questions and reflection.", sessionNumber: 3, sessionType: "prayer", deliveryMode: "online", scheduledStartAt: wat(item.dates[2], "20:00"), scheduledEndAt: wat(item.dates[2], "21:30"), facilitatorName: item.facilitator, physicalLocation: null }),
]);

const advancedBlocks = [
  { code: "RSD-ADV 201", title: "Marriage, Relationships and Family Life", facilitator: "Pastor Arome Iduh", dates: [[1, "2026-08-24"], [1, "2026-08-25"], [1, "2026-08-26"], [2, "2026-08-31"], [2, "2026-09-01"], [2, "2026-09-02"]] },
  { code: "RSD-ADV 202", title: "Marketplace Ministry and Kingdom Influence", facilitator: "Pastor Arome Iduh", dates: [[3, "2026-09-07"], [3, "2026-09-08"], [3, "2026-09-09"]] },
  { code: "RSD-ADV 203", title: "Ministry, Priesthood and Church Service", facilitator: "Pastor Arome Iduh", dates: [[4, "2026-09-14"], [4, "2026-09-15"], [4, "2026-09-16"], [5, "2026-09-21"], [5, "2026-09-22"], [5, "2026-09-23"]] },
  { code: "RSD-ADV 204", title: "Biblical Principles of Counselling", facilitator: "Minister Daniel", dates: [[6, "2026-09-28"], [6, "2026-09-29"], [6, "2026-09-30"]] },
  { code: "RSD-ADV 205", title: "Christian Philosophy and Critical Thinking", facilitator: "Oluwatobi Adekunle", dates: [[7, "2026-10-05"], [7, "2026-10-06"], [7, "2026-10-07"]] },
] as const;

const advancedSessions: August2026Session[] = advancedBlocks.flatMap((block) => block.dates.map(([week, date], index) => session({
  courseCode: block.code,
  route: "advanced",
  week,
  title: `Week ${week} — ${block.title} — Session ${(index % 3) + 1}`,
  description: "Advanced discipleship teaching session. An approved guest teacher may replace the named primary facilitator only after the timetable is formally updated.",
  sessionNumber: index + 1,
  sessionType: "teaching",
  deliveryMode: "online",
  scheduledStartAt: wat(date, "19:00"),
  scheduledEndAt: wat(date, "21:00"),
  facilitatorName: block.facilitator,
  physicalLocation: null,
})));

[
  { date: "2026-10-12", title: "Week 8 — Advanced Integration — Session 1", type: "review" as const },
  { date: "2026-10-13", title: "Week 8 — Advanced Application — Session 2", type: "practical" as const },
  { date: "2026-10-14", title: "Week 8 — Advanced Final Assessment — Session 3", type: "assessment" as const },
].forEach((item, index) => advancedSessions.push(session({ courseCode: "RSD-ADV 205", route: "advanced", week: 8, title: item.title, description: "Programme-wide Advanced integration activity. This is not a sixth Advanced course; the direct session facilitator remains pending approved assignment.", sessionNumber: index + 4, sessionType: item.type, deliveryMode: "online", scheduledStartAt: wat(item.date, "19:00"), scheduledEndAt: wat(item.date, "21:00"), facilitatorName: null, physicalLocation: null })));

const web = [
  ["RSD-WEB 101", "Digital Foundations", ["2026-08-24", "2026-08-25"]],
  ["RSD-WEB 102", "HTML and Semantic Web", ["2026-08-31", "2026-09-01"]],
  ["RSD-WEB 103", "CSS, Box Model and Layout", ["2026-09-07", "2026-09-08"]],
  ["RSD-WEB 104", "Responsive Design and UI/UX Foundations", ["2026-09-14", "2026-09-15"]],
  ["RSD-WEB 105", "JavaScript Fundamentals", ["2026-09-21", "2026-09-22"]],
  ["RSD-WEB 106", "DOM, Events, Forms and Validation", ["2026-09-28", "2026-09-29"]],
  ["RSD-WEB 107", "Git, GitHub, Deployment and Client Workflow", ["2026-10-05", "2026-10-06"]],
  ["RSD-WEB 108", "Time Management, Focus and Kingdom Stewardship", ["2026-10-12", "2026-10-13"]],
] as const;

const webSessions = web.flatMap(([courseCode, title, dates], index) => dates.map((date, sessionIndex) => session({ courseCode, route: "web", week: index + 1, title: `Week ${index + 1} — ${title} — Session ${sessionIndex + 1}`, description: "Web Development teaching session using the student's approved physical or online delivery route.", sessionNumber: sessionIndex + 1, sessionType: "teaching", deliveryMode: "hybrid", scheduledStartAt: wat(date, "15:30"), scheduledEndAt: wat(date, "18:00"), facilitatorName: "Oluwatobi Adekunle", physicalLocation: august2026PhysicalLocation })));

const cyber = [
  ["RSD-CYB 101", "Cybersecurity, Ethics and Laboratory Setup", ["2026-08-26", "2026-08-28"]],
  ["RSD-CYB 102", "Computer Systems and Command-Line Foundations", ["2026-09-02", "2026-09-04"]],
  ["RSD-CYB 103", "Networking Fundamentals", ["2026-09-09", "2026-09-11"]],
  ["RSD-CYB 104", "Threats, Vulnerabilities, Risk and Controls", ["2026-09-16", "2026-09-18"]],
  ["RSD-CYB 105", "System Hardening and Network Security", ["2026-09-23", "2026-09-25"]],
  ["RSD-CYB 106", "Approved-Lab Reconnaissance and Vulnerability Assessment", ["2026-09-30", "2026-10-02"]],
  ["RSD-CYB 107", "Incident Response and Security Reporting", ["2026-10-07", "2026-10-09"]],
  ["RSD-CYB 108", "Time Management, Focus and Professional Discipline", ["2026-10-14", "2026-10-16"]],
] as const;

const cyberSessions = cyber.flatMap(([courseCode, title, dates], index) => dates.map((date, sessionIndex) => session({ courseCode, route: "cyber", week: index + 1, title: `Week ${index + 1} — ${title} — Session ${sessionIndex + 1}`, description: "Cybersecurity Foundations teaching session. Practical work remains restricted to authorised laboratory systems and published scopes.", sessionNumber: sessionIndex + 1, sessionType: "teaching", deliveryMode: "hybrid", scheduledStartAt: wat(date, "15:30"), scheduledEndAt: wat(date, "18:00"), facilitatorName: "Oluwatobi Adekunle", physicalLocation: august2026PhysicalLocation })));

export const august2026Sessions: readonly August2026Session[] = [...foundationalSessions, ...advancedSessions, ...webSessions, ...cyberSessions];

export const august2026Orientation = {
  eventKey: "orientation-matriculation-2026-08-21",
  eventType: "orientation_matriculation",
  title: "REALMS School of Discovery August 2026 Orientation & Matriculation",
  description: "Required online orientation and matriculation event for admitted and enrolled August 2026 cohort students. This event carries no academic mark.",
  scheduledStartAt: wat("2026-08-21", "19:00"),
  scheduledEndAt: null,
  timezone: august2026Timezone,
  deliveryMode: "online",
  liveJoinUrl: null,
  physicalLocation: null,
  eventStatus: "scheduled",
  visibilityStatus: "enrolled_only",
  isRequired: true,
} as const;

export const august2026AdditionalFacilitatorAssignments = [
  { courseCode: "RSD-DIS 108", facilitatorName: "Oluwatobi Adekunle", assignmentRole: "co_facilitator" },
] as const;

export function august2026SessionCounts() {
  return Object.fromEntries(["foundational", "advanced", "web", "cyber"].map((route) => [route, august2026Sessions.filter((item) => item.route === route).length])) as Record<August2026Session["route"], number>;
}

export function august2026ScheduleConflicts() {
  const direct = august2026Sessions.flatMap((item) => [
    ...(item.facilitatorName ? [{ ...item, participantName: item.facilitatorName }] : []),
    ...august2026AdditionalFacilitatorAssignments.filter((assignment) => assignment.courseCode === item.courseCode).map((assignment) => ({ ...item, participantName: assignment.facilitatorName })),
  ]);
  const overlaps: Array<{ facilitator: string; first: string; second: string }> = [];
  const tightTransitions: Array<{ facilitator: string; first: string; second: string; minutes: number }> = [];
  for (let index = 0; index < direct.length; index += 1) for (let next = index + 1; next < direct.length; next += 1) {
    const a = direct[index]; const b = direct[next];
    if (a.participantName !== b.participantName) continue;
    const [first, second] = Date.parse(a.scheduledStartAt) <= Date.parse(b.scheduledStartAt) ? [a, b] : [b, a];
    const gap = (Date.parse(second.scheduledStartAt) - Date.parse(first.scheduledEndAt)) / 60_000;
    if (gap < 0) overlaps.push({ facilitator: first.participantName, first: first.title, second: second.title });
    else if (gap <= 60) tightTransitions.push({ facilitator: first.participantName, first: first.title, second: second.title, minutes: gap });
  }
  return { overlaps, tightTransitions };
}
