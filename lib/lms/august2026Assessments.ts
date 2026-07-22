import type { SubmissionRequirements } from "@/lib/lms/assessment";

export const august2026AssessmentCohortCode = "RSD-AUG-2026";
export const august2026AssessmentContentPending = "CONTENT PENDING FACILITATOR TEACHING / ACADEMIC REVIEW";

export type August2026RubricKey = "discipleship" | "web_practical" | "cyber_practical" | "professional_workflow" | "web_capstone" | "cyber_capstone";

export type August2026AssessmentShell = {
  stableKey: string;
  assessmentKind: "assignment" | "quiz";
  courseCode: string;
  route: "foundational" | "advanced" | "web" | "cyber";
  title: string;
  assignmentType: string;
  assessmentDomain: "discipleship" | "skill";
  assessmentCategory: string;
  evidencePurpose: string;
  maxScore: 100;
  categoryMaxPoints: number;
  weightUnits: number;
  attemptSelection: "latest_graded";
  isRequired: true;
  requiredForGraduation: boolean;
  countsTowardResult: false;
  activeWeighting: false;
  dueAt: null;
  allowLateSubmission: true;
  maxSubmissionAttempts: number;
  submissionRequirements: SubmissionRequirements;
  rubricKey: August2026RubricKey | null;
};

export type August2026RubricCriterion = {
  criterion: string;
  description: string;
  maxPoints: number;
};

export const august2026Rubrics: Record<August2026RubricKey, readonly August2026RubricCriterion[]> = {
  discipleship: [
    { criterion: "Understanding of taught material", description: "Demonstrates accurate understanding of the approved teaching and course outcomes.", maxPoints: 20 },
    { criterion: "Biblical and theological accuracy", description: "Works faithfully within the taught framework without introducing unsupported claims.", maxPoints: 20 },
    { criterion: "Application", description: "Connects the taught material to responsible personal, ministry or vocational application.", maxPoints: 20 },
    { criterion: "Clarity and coherence", description: "Presents a focused, well-organised and understandable response.", maxPoints: 20 },
    { criterion: "Integrity and originality", description: "Represents the student's own understanding and discloses permitted assistance where required.", maxPoints: 20 },
  ],
  web_practical: [
    { criterion: "Requirements fulfilled", description: "Addresses the approved practical requirements and evidence checklist.", maxPoints: 20 },
    { criterion: "Technical correctness", description: "The implementation behaves correctly and uses appropriate web standards.", maxPoints: 20 },
    { criterion: "Structure and code quality", description: "Code is organised, readable and maintainable at the expected level.", maxPoints: 15 },
    { criterion: "Responsive and usability quality", description: "The work is usable and responsive where the approved brief requires it.", maxPoints: 15 },
    { criterion: "Problem-solving", description: "Shows sound reasoning, debugging and implementation decisions.", maxPoints: 15 },
    { criterion: "Documentation and explanation", description: "Explains the work, decisions and limitations clearly.", maxPoints: 10 },
    { criterion: "Submission professionalism", description: "Evidence is complete, accessible and presented professionally.", maxPoints: 5 },
  ],
  cyber_practical: [
    { criterion: "Scope and ethical compliance", description: "Work stays within the authorised laboratory scope and published rules.", maxPoints: 15 },
    { criterion: "Technical understanding", description: "Demonstrates correct understanding of the approved security concepts and tools.", maxPoints: 20 },
    { criterion: "Method and process", description: "Uses a defensible, repeatable and appropriately documented method.", maxPoints: 15 },
    { criterion: "Evidence quality", description: "Provides relevant, safe and sufficient evidence for the stated findings.", maxPoints: 15 },
    { criterion: "Risk and security reasoning", description: "Interprets observations responsibly and explains their security significance.", maxPoints: 15 },
    { criterion: "Reporting and documentation", description: "Communicates findings, limitations and recommendations clearly.", maxPoints: 15 },
    { criterion: "Professional discipline", description: "Follows naming, submission and handling requirements professionally.", maxPoints: 5 },
  ],
  professional_workflow: [
    { criterion: "Understanding", description: "Shows understanding of the taught workflow and professional expectations.", maxPoints: 20 },
    { criterion: "Practical application", description: "Applies the learning to a realistic personal project or study workflow.", maxPoints: 25 },
    { criterion: "Planning and prioritisation", description: "Uses a clear, workable plan with appropriate priorities.", maxPoints: 20 },
    { criterion: "Reflection and improvement", description: "Identifies limitations, lessons and specific improvements.", maxPoints: 20 },
    { criterion: "Clarity, integrity and professionalism", description: "The evidence is clear, truthful and professionally presented.", maxPoints: 15 },
  ],
  web_capstone: [
    { criterion: "Planning", description: "Uses an approved plan, scope and delivery approach.", maxPoints: 10 },
    { criterion: "Technical execution", description: "Implements the approved solution correctly and reliably.", maxPoints: 20 },
    { criterion: "Requirements completion", description: "Meets the approved brief and deliverable requirements.", maxPoints: 15 },
    { criterion: "Quality and usability", description: "Demonstrates appropriate design, responsiveness, accessibility and finish.", maxPoints: 10 },
    { criterion: "Documentation and reporting", description: "Provides clear repository, deployment and supporting documentation evidence.", maxPoints: 10 },
    { criterion: "Problem-solving", description: "Explains significant decisions, challenges and resolutions.", maxPoints: 10 },
    { criterion: "Professional presentation", description: "Presents the project and evidence professionally.", maxPoints: 10 },
    { criterion: "Defence", description: "Explains and defends the submitted work during the separately scheduled defence.", maxPoints: 10 },
    { criterion: "Integrity", description: "Can account for the work and disclose permitted assistance accurately.", maxPoints: 5 },
  ],
  cyber_capstone: [
    { criterion: "Planning and authorised scope", description: "Uses an approved laboratory scope, plan and handling approach.", maxPoints: 15 },
    { criterion: "Technical execution", description: "Performs the approved practical work correctly and safely.", maxPoints: 20 },
    { criterion: "Requirements completion", description: "Meets the approved evidence and reporting requirements.", maxPoints: 10 },
    { criterion: "Evidence quality", description: "Provides relevant, sufficient and responsibly handled evidence.", maxPoints: 10 },
    { criterion: "Risk reasoning", description: "Interprets findings and recommendations with sound security reasoning.", maxPoints: 10 },
    { criterion: "Professional report", description: "Produces a clear, structured and actionable security report.", maxPoints: 10 },
    { criterion: "Problem-solving", description: "Explains decisions, limitations and corrective steps.", maxPoints: 10 },
    { criterion: "Defence", description: "Explains and defends the submitted work during the separately scheduled defence.", maxPoints: 10 },
    { criterion: "Integrity and ethical compliance", description: "Can account for the work and demonstrates full scope and ethics compliance.", maxPoints: 5 },
  ],
};

const textOnly: SubmissionRequirements = { text_response_required: true, repository_url_required: false, deployment_url_required: false, external_url_allowed: false, file_upload_allowed: false };
const webEvidence: SubmissionRequirements = { text_response_required: true, repository_url_required: true, deployment_url_required: false, external_url_allowed: true, file_upload_allowed: false };
const webDeployment: SubmissionRequirements = { ...webEvidence, deployment_url_required: true };
const cyberEvidence: SubmissionRequirements = { text_response_required: true, repository_url_required: false, deployment_url_required: false, external_url_allowed: false, file_upload_allowed: true };

const categoryPoints: Record<string, number> = {
  weekly_quiz_reflection: 10,
  route_application: 8,
  route_practical: 7,
  growth_integration: 5,
  final_route_assessment: 10,
  weekly_practical: 15,
  assignment_mini_project: 10,
  documentation: 5,
  time_management: 5,
  capstone: 10,
};

type ShellInput = Omit<August2026AssessmentShell, "stableKey" | "assessmentKind" | "maxScore" | "categoryMaxPoints" | "attemptSelection" | "isRequired" | "countsTowardResult" | "activeWeighting" | "dueAt" | "allowLateSubmission">;

function shell(input: ShellInput): August2026AssessmentShell {
  return {
    ...input,
    stableKey: `${august2026AssessmentCohortCode}:${input.courseCode}:${input.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    assessmentKind: "assignment",
    maxScore: 100,
    categoryMaxPoints: categoryPoints[input.assessmentCategory],
    attemptSelection: "latest_graded",
    isRequired: true,
    countsTowardResult: false,
    activeWeighting: false,
    dueAt: null,
    allowLateSubmission: true,
  };
}

function quizShell(input: ShellInput): August2026AssessmentShell {
  return { ...shell(input), assessmentKind: "quiz", rubricKey: null };
}

const discipleshipShells: August2026AssessmentShell[] = [
  quizShell({ courseCode: "RSD-DIS 101", route: "foundational", title: "Week 1 — Soteriology I Learning Check", assignmentType: "worksheet", assessmentDomain: "discipleship", assessmentCategory: "weekly_quiz_reflection", evidencePurpose: "Understanding check based on the approved Soteriology I teaching and class summary.", weightUnits: 1, requiredForGraduation: false, maxSubmissionAttempts: 2, submissionRequirements: textOnly, rubricKey: "discipleship" }),
  quizShell({ courseCode: "RSD-DIS 102", route: "foundational", title: "Week 2 — Soteriology II Learning Check", assignmentType: "worksheet", assessmentDomain: "discipleship", assessmentCategory: "weekly_quiz_reflection", evidencePurpose: "Understanding check based on the approved Soteriology II teaching and class summary.", weightUnits: 1, requiredForGraduation: false, maxSubmissionAttempts: 2, submissionRequirements: textOnly, rubricKey: "discipleship" }),
  shell({ courseCode: "RSD-DIS 103", route: "foundational", title: "Week 3 — Spiritual Formation Reflection & Learning Check", assignmentType: "reflection", assessmentDomain: "discipleship", assessmentCategory: "growth_integration", evidencePurpose: "Reflection and application evidence grounded in the approved Spiritual Formation teaching.", weightUnits: 1, requiredForGraduation: false, maxSubmissionAttempts: 2, submissionRequirements: textOnly, rubricKey: "discipleship" }),
  shell({ courseCode: "RSD-DIS 104", route: "foundational", title: "Week 4 — Purpose and Calling Application", assignmentType: "reflection", assessmentDomain: "discipleship", assessmentCategory: "route_application", evidencePurpose: "Application evidence based on the approved Purpose and Calling teaching.", weightUnits: 1, requiredForGraduation: false, maxSubmissionAttempts: 2, submissionRequirements: textOnly, rubricKey: "discipleship" }),
  quizShell({ courseCode: "RSD-DIS 105", route: "foundational", title: "Week 5 — Kingdom Leadership Learning Check", assignmentType: "case_study", assessmentDomain: "discipleship", assessmentCategory: "weekly_quiz_reflection", evidencePurpose: "Learning check and application evidence based on the approved Kingdom Leadership teaching.", weightUnits: 1, requiredForGraduation: false, maxSubmissionAttempts: 2, submissionRequirements: textOnly, rubricKey: "discipleship" }),
  shell({ courseCode: "RSD-DIS 106", route: "foundational", title: "Week 6 — Kingdom Finance & Stewardship Learning Check", assignmentType: "case_study", assessmentDomain: "discipleship", assessmentCategory: "route_application", evidencePurpose: "Understanding and stewardship application evidence based on the approved teaching.", weightUnits: 1, requiredForGraduation: false, maxSubmissionAttempts: 2, submissionRequirements: textOnly, rubricKey: "discipleship" }),
  shell({ courseCode: "RSD-DIS 107", route: "foundational", title: "Week 7 — Missions and Evangelism Learning Check", assignmentType: "ministry_practical", assessmentDomain: "discipleship", assessmentCategory: "route_practical", evidencePurpose: "Understanding and responsible ministry-application evidence based on the approved teaching.", weightUnits: 1, requiredForGraduation: false, maxSubmissionAttempts: 2, submissionRequirements: textOnly, rubricKey: "discipleship" }),
  shell({ courseCode: "RSD-DIS 108", route: "foundational", title: "Week 8 — Foundational Integration & Final Route Assessment", assignmentType: "project", assessmentDomain: "discipleship", assessmentCategory: "final_route_assessment", evidencePurpose: "Programme integration and final route evidence based on the approved Foundational teaching record.", weightUnits: 1, requiredForGraduation: true, maxSubmissionAttempts: 2, submissionRequirements: textOnly, rubricKey: "discipleship" }),
  shell({ courseCode: "RSD-ADV 201", route: "advanced", title: "ADV201 — Marriage, Relationships and Family Life Application", assignmentType: "reflection", assessmentDomain: "discipleship", assessmentCategory: "route_application", evidencePurpose: "Case or application reflection based only on the approved ADV201 teaching.", weightUnits: 1, requiredForGraduation: false, maxSubmissionAttempts: 2, submissionRequirements: textOnly, rubricKey: "discipleship" }),
  shell({ courseCode: "RSD-ADV 202", route: "advanced", title: "ADV202 — Marketplace and Kingdom Influence Learning Check", assignmentType: "case_study", assessmentDomain: "discipleship", assessmentCategory: "weekly_quiz_reflection", evidencePurpose: "Application or scenario evidence based only on the approved ADV202 teaching.", weightUnits: 1, requiredForGraduation: false, maxSubmissionAttempts: 2, submissionRequirements: textOnly, rubricKey: "discipleship" }),
  shell({ courseCode: "RSD-ADV 203", route: "advanced", title: "ADV203 — Ministry, Priesthood and Church Service Application", assignmentType: "ministry_practical", assessmentDomain: "discipleship", assessmentCategory: "route_practical", evidencePurpose: "Case and ministry-application evidence based only on the approved ADV203 teaching.", weightUnits: 1, requiredForGraduation: false, maxSubmissionAttempts: 2, submissionRequirements: textOnly, rubricKey: "discipleship" }),
  shell({ courseCode: "RSD-ADV 204", route: "advanced", title: "ADV204 — Biblical Counselling Case Analysis", assignmentType: "case_study", assessmentDomain: "discipleship", assessmentCategory: "route_application", evidencePurpose: "Case analysis framed by the approved ADV204 teaching; no scenario is supplied by this shell.", weightUnits: 1, requiredForGraduation: false, maxSubmissionAttempts: 2, submissionRequirements: textOnly, rubricKey: "discipleship" }),
  shell({ courseCode: "RSD-ADV 205", route: "advanced", title: "ADV205 — Christian Worldview and Argument Evaluation", assignmentType: "case_study", assessmentDomain: "discipleship", assessmentCategory: "growth_integration", evidencePurpose: "Critical-thinking and worldview evaluation evidence based only on approved ADV205 teaching.", weightUnits: 1, requiredForGraduation: false, maxSubmissionAttempts: 2, submissionRequirements: textOnly, rubricKey: "discipleship" }),
  shell({ courseCode: "RSD-ADV 205", route: "advanced", title: "Week 8 — Advanced Integration & Final Route Assessment", assignmentType: "project", assessmentDomain: "discipleship", assessmentCategory: "final_route_assessment", evidencePurpose: "Programme-wide Advanced integration and final route evidence. This is not an ADV206 course.", weightUnits: 1, requiredForGraduation: true, maxSubmissionAttempts: 2, submissionRequirements: textOnly, rubricKey: "discipleship" }),
];

const webShells = [
  ["RSD-WEB 101", "Week 1 — Web Foundations Evidence", "practical", "weekly_practical", "Development-environment and web-foundations evidence.", textOnly, "web_practical"],
  ["RSD-WEB 102", "Week 2 — Semantic HTML Practical", "practical", "weekly_practical", "Semantic HTML practical evidence based on the approved weekly brief.", webEvidence, "web_practical"],
  ["RSD-WEB 103", "Week 3 — CSS and Layout Practical", "practical", "weekly_practical", "CSS and layout implementation evidence based on the approved weekly brief.", webEvidence, "web_practical"],
  ["RSD-WEB 104", "Week 4 — Responsive Design and UI Practical", "practical", "weekly_practical", "Responsive design and usability evidence based on the approved weekly brief.", webDeployment, "web_practical"],
  ["RSD-WEB 105", "Week 5 — JavaScript Fundamentals Practical", "assignment", "assignment_mini_project", "JavaScript implementation evidence based on the approved weekly brief.", webEvidence, "web_practical"],
  ["RSD-WEB 106", "Week 6 — DOM, Events and Forms Practical", "assignment", "documentation", "DOM, event and form implementation with concise technical explanation.", webEvidence, "web_practical"],
  ["RSD-WEB 107", "Week 7 — Git, Deployment and Client Workflow Practical", "project", "assignment_mini_project", "Repository, deployment and professional workflow evidence.", webDeployment, "web_practical"],
  ["RSD-WEB 108", "Week 8 — Project Delivery and Stewardship Reflection", "time_management", "time_management", "Time-management, project-delivery and stewardship workflow evidence.", textOnly, "professional_workflow"],
] as const;

const cyberShells = [
  ["RSD-CYB 101", "Week 1 — Ethical Lab Setup Evidence", "practical", "weekly_practical", "Ethical agreement, authorised-scope and safe laboratory setup evidence.", cyberEvidence, "cyber_practical"],
  ["RSD-CYB 102", "Week 2 — Systems and Command-Line Practical", "practical", "weekly_practical", "System and command-line evidence within the approved laboratory.", cyberEvidence, "cyber_practical"],
  ["RSD-CYB 103", "Week 3 — Networking Analysis", "report", "weekly_practical", "Networking analysis based on the approved laboratory exercise.", cyberEvidence, "cyber_practical"],
  ["RSD-CYB 104", "Week 4 — Threat, Vulnerability and Risk Exercise", "case_study", "weekly_practical", "Threat, vulnerability, risk and control reasoning within an approved scenario.", cyberEvidence, "cyber_practical"],
  ["RSD-CYB 105", "Week 5 — Hardening and Security Controls Practical", "practical", "assignment_mini_project", "System-hardening and control evidence within the approved laboratory.", cyberEvidence, "cyber_practical"],
  ["RSD-CYB 106", "Week 6 — Approved-Lab Vulnerability Assessment Report", "report", "documentation", "Reconnaissance and vulnerability-assessment report limited to the published lab scope.", cyberEvidence, "cyber_practical"],
  ["RSD-CYB 107", "Week 7 — Incident Response and Security Reporting Exercise", "report", "assignment_mini_project", "Incident-response and professional reporting evidence based on an approved exercise.", cyberEvidence, "cyber_practical"],
  ["RSD-CYB 108", "Week 8 — Professional Discipline and Workflow Reflection", "time_management", "time_management", "Time-management, focus and professional-discipline workflow evidence.", textOnly, "professional_workflow"],
] as const;

function skillShells(route: "web" | "cyber", definitions: typeof webShells | typeof cyberShells): August2026AssessmentShell[] {
  return definitions.map(([courseCode, title, assignmentType, assessmentCategory, evidencePurpose, submissionRequirements, rubricKey]) => shell({ courseCode, route, title, assignmentType, assessmentDomain: "skill", assessmentCategory, evidencePurpose, weightUnits: 1, requiredForGraduation: false, maxSubmissionAttempts: 2, submissionRequirements, rubricKey }));
}

const capstones: August2026AssessmentShell[] = [
  shell({ courseCode: "RSD-WEB 190", route: "web", title: "WEB190 — Web Development Capstone", assignmentType: "capstone", assessmentDomain: "skill", assessmentCategory: "capstone", evidencePurpose: "Approved project brief, repository, live deployment, supporting report, evaluator feedback and separately scheduled defence.", weightUnits: 1, requiredForGraduation: true, maxSubmissionAttempts: 2, submissionRequirements: webDeployment, rubricKey: "web_capstone" }),
  shell({ courseCode: "RSD-CYB 190", route: "cyber", title: "CYB190 — Cybersecurity Foundations Capstone", assignmentType: "capstone", assessmentDomain: "skill", assessmentCategory: "capstone", evidencePurpose: "Approved lab scope, practical evidence, professional security report, evaluator feedback and separately scheduled defence. No real-world target, malware sample or unsafe executable is authorised.", weightUnits: 1, requiredForGraduation: true, maxSubmissionAttempts: 2, submissionRequirements: cyberEvidence, rubricKey: "cyber_capstone" }),
];

export const august2026AssessmentShells: readonly August2026AssessmentShell[] = [
  ...discipleshipShells,
  ...skillShells("web", webShells),
  ...skillShells("cyber", cyberShells),
  ...capstones,
];

export function august2026AssessmentDescription(item: August2026AssessmentShell) {
  return `${august2026AssessmentContentPending}\n\nEvidence purpose: ${item.evidencePurpose}`;
}

export function august2026AssessmentInstructions(item: August2026AssessmentShell) {
  const capstoneTiming = item.assignmentType === "capstone" ? " The exact submission deadline must be configured within 19–24 October 2026 after academic approval; no defence time is set by this shell." : " Release and deadline remain configurable and must follow the approved teaching schedule.";
  const marks = item.assessmentKind === "quiz" ? ` Planned maximum marks: ${item.maxScore}; approved questions must total this amount before publication.` : "";
  return `${august2026AssessmentContentPending}. Draft the detailed prompt from approved course outcomes, facilitator teaching and the reviewed class summary. Human academic review is required before publication.${marks}${capstoneTiming} AI assistance is not assumed to be allowed: the final assessment must explicitly state whether it is allowed, restricted, disclosure-required or prohibited, and students must remain able to explain and defend their work.`;
}

export function august2026AssessmentCounts() {
  return Object.fromEntries(["foundational", "advanced", "web", "cyber"].map((route) => [route, august2026AssessmentShells.filter((item) => item.route === route).length])) as Record<August2026AssessmentShell["route"], number>;
}
