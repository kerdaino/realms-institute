export type PublicCourse = {
  code: string;
  title: string;
  delivery?: string;
  covers?: string;
  learning?: string;
  evidence?: string;
};

export const schoolOfDiscoveryStructureStatement = "Every student completes one approved discipleship route—Foundational or Advanced—and one practical skill pathway: Web Development or Cybersecurity Foundations.";

export const schoolOfDiscoveryLearningModeStatement = "Choose Physical or Online for your practical skill pathway. Discipleship sessions are delivered online.";

export const schoolOfDiscoveryCertificateStatement = "REALMS Institute institutional certificate of completion/competence upon successful completion of the published School of Discovery programme requirements.";

export const schoolOfDiscoveryApplicationPaths = [
  {
    title: "New Student",
    steps: ["Foundational Discipleship requested", "Normal application and admission review"],
  },
  {
    title: "REALMS Alumnus",
    steps: ["Advanced Discipleship requested", "Previous REALMS participation must be verified", "Admission review remains required"],
  },
  {
    title: "Prior Theological / Discipleship Education",
    steps: ["Advanced Discipleship requested", "Foundational knowledge screening and review required", "Admission review remains required"],
  },
] as const;

export const foundationalDiscipleshipCourses = [
  {
    code: "RSD-DIS 101",
    title: "Soteriology I: The Gospel and the Work of Christ",
    covers: "The gospel, the person and work of Jesus Christ, the cross and the resurrection.",
    learning: "Explain the central message of the gospel and why Christ's finished work matters for Christian faith.",
    evidence: "Guided reflection, knowledge checks and participation in course exercises.",
  },
  {
    code: "RSD-DIS 102",
    title: "Soteriology II: Salvation and the New Creation",
    covers: "Salvation, regeneration, justification, adoption, identity in Christ and new-creation life.",
    learning: "Describe foundational salvation realities and connect them to daily Christian identity and conduct.",
    evidence: "Written reflection, knowledge checks and applied identity exercises.",
  },
  {
    code: "RSD-DIS 103",
    title: "Spiritual Formation and Christian Disciplines",
    covers: "Scripture, prayer, worship, fellowship, obedience and sustainable spiritual disciplines.",
    learning: "Build a responsible pattern of devotion and explain how Christian disciplines support formation.",
    evidence: "A practical formation plan, participation and reflective assignments.",
  },
  {
    code: "RSD-DIS 104",
    title: "Purpose and Calling",
    covers: "Biblical purpose, calling, gifts, responsibility and faithful service in one's sphere.",
    learning: "Distinguish identity, calling and assignment while identifying responsible next steps for growth and service.",
    evidence: "Purpose reflection, personal application and a simple responsibility map.",
  },
  {
    code: "RSD-DIS 105",
    title: "Kingdom Leadership and Character",
    covers: "Servant leadership, integrity, humility, accountability, influence and Christian character.",
    learning: "Recognise character as foundational to trustworthy leadership and apply kingdom principles to real situations.",
    evidence: "Case reflection, participation and a personal character-development plan.",
  },
  {
    code: "RSD-DIS 106",
    title: "Kingdom Finance and Stewardship",
    covers: "Biblical stewardship of money, work, time, opportunity, generosity and contentment.",
    learning: "Apply responsible stewardship principles to personal resources and kingdom responsibility.",
    evidence: "Stewardship reflection and a practical personal plan.",
  },
  {
    code: "RSD-DIS 107",
    title: "Missions and Evangelism",
    covers: "The Great Commission, personal witness, missions, compassion and responsible gospel communication.",
    learning: "Explain the gospel clearly and approach evangelism with truth, love, wisdom and responsibility.",
    evidence: "Gospel articulation exercise, outreach planning and participation.",
  },
  {
    code: "RSD-DIS 108",
    title: "Integration, Assessment and Commissioning",
    covers: "Integration of foundational learning, personal reflection, assessment and preparation for faithful service.",
    learning: "Connect the programme's core themes and identify accountable next steps beyond the cohort.",
    evidence: "Integrated assessment, final reflection and commissioning participation.",
  },
] as const satisfies readonly PublicCourse[];

export const advancedDiscipleshipCourses = [
  { code: "RSD-ADV 201", title: "Marriage, Relationships and Family Life", delivery: "Weeks 1–2" },
  { code: "RSD-ADV 202", title: "Marketplace Ministry and Kingdom Influence", delivery: "Week 3" },
  { code: "RSD-ADV 203", title: "Ministry, Priesthood and Church Service", delivery: "Weeks 4–5" },
  { code: "RSD-ADV 204", title: "Biblical Principles of Counselling", delivery: "Weeks 6–7" },
  { code: "RSD-ADV 205", title: "Christian Philosophy and Critical Thinking", delivery: "Week 8" },
] as const satisfies readonly PublicCourse[];

export const webDevelopmentCourses = [
  { code: "RSD-WEB 101", title: "Digital Foundations and How the Web Works", delivery: "Week 1" },
  { code: "RSD-WEB 102", title: "HTML and the Semantic Web", delivery: "Week 2" },
  { code: "RSD-WEB 103", title: "CSS, Box Model and Layout", delivery: "Week 3" },
  { code: "RSD-WEB 104", title: "Responsive Design and UI/UX Foundations", delivery: "Week 4" },
  { code: "RSD-WEB 105", title: "JavaScript Fundamentals", delivery: "Week 5" },
  { code: "RSD-WEB 106", title: "DOM, Events, Forms and Validation", delivery: "Week 6" },
  { code: "RSD-WEB 107", title: "Git, GitHub, Deployment and Client Workflow", delivery: "Week 7" },
  { code: "RSD-WEB 108", title: "Time Management, Focus and Kingdom Stewardship for Developers", delivery: "Week 8" },
  { code: "RSD-WEB 190", title: "Integrated Web Development Capstone", delivery: "Integrated capstone" },
] as const satisfies readonly PublicCourse[];

export const cybersecurityCourses = [
  { code: "RSD-CYB 101", title: "Cybersecurity, Ethics and Laboratory Setup", delivery: "Week 1" },
  { code: "RSD-CYB 102", title: "Computer Systems and Command-Line Foundations", delivery: "Week 2" },
  { code: "RSD-CYB 103", title: "Networking Fundamentals", delivery: "Week 3" },
  { code: "RSD-CYB 104", title: "Threats, Vulnerabilities, Risk and Controls", delivery: "Week 4" },
  { code: "RSD-CYB 105", title: "System Hardening and Network Security", delivery: "Week 5" },
  { code: "RSD-CYB 106", title: "Approved-Lab Reconnaissance and Vulnerability Assessment", delivery: "Week 6" },
  { code: "RSD-CYB 107", title: "Incident Response and Security Reporting", delivery: "Week 7" },
  { code: "RSD-CYB 108", title: "Time Management, Focus and Professional Discipline", delivery: "Week 8" },
  { code: "RSD-CYB 190", title: "Integrated Cybersecurity Foundations Capstone", delivery: "Integrated capstone" },
] as const satisfies readonly PublicCourse[];

export const skillPathwayCurricula = [
  {
    id: "web-development",
    title: "Web Development",
    subtitle: "From digital foundations to a deployed functional website.",
    purpose: "Designed to take a committed beginner through the foundations of how the web works, frontend development, responsive design, JavaScript, Git/GitHub, deployment and professional project workflow.",
    courses: webDevelopmentCourses,
    outcomes: [
      "Understand how websites, browsers, servers, domains and hosting work",
      "Build structured webpages with HTML",
      "Style responsive layouts with CSS",
      "Apply basic UI/UX and accessibility principles",
      "Add foundational interactivity using JavaScript",
      "Work with DOM events, forms and validation",
      "Use Git and GitHub for foundational project workflow",
      "Deploy a functional website online",
      "Document and explain project decisions",
      "Build and defend a beginner-level capstone website",
    ],
    capstone: "Plan, build and deploy a functional responsive website, maintain a documented source repository, and present and defend the completed project.",
    applyHref: "/register?skill=web-development",
  },
  {
    id: "cybersecurity-foundations",
    title: "Cybersecurity Foundations",
    subtitle: "Build safe, ethical and practical foundations in digital security.",
    purpose: "Designed to establish practical foundations in systems, command-line use, networking, threats, risk, hardening, authorised laboratory assessment, incident response and security reporting.",
    courses: cybersecurityCourses,
    outcomes: [
      "Explain foundational cybersecurity and ethical principles",
      "Work with basic computer-system and command-line concepts",
      "Understand foundational networking concepts and protocols",
      "Identify common threats, vulnerabilities, risks and controls",
      "Apply foundational system-hardening concepts",
      "Conduct controlled reconnaissance and vulnerability assessment only within specifically authorised laboratory environments",
      "Document security findings and remediation recommendations",
      "Understand foundational incident-response and security-reporting processes",
      "Complete and defend an approved-lab cybersecurity capstone",
    ],
    capstone: "Complete an authorised foundational security-assessment workflow, prepare an approved-lab report with supporting evidence, explain risk and remediation, and defend the work responsibly.",
    ethicsNotice: "All cybersecurity practical work is restricted to systems and laboratory environments specifically provided or authorised by REALMS Institute. Students must never test systems without explicit authorisation.",
    equipmentNote: "Laptop or desktop computer required. 8 GB RAM is recommended where virtualisation is required.",
    applyHref: "/register?skill=cybersecurity-foundations",
  },
] as const;

export const programmeCompletionComponents = [
  "Approved Discipleship Route",
  "Selected Skill Pathway",
  "Attendance, Participation, Integrity & Assessment",
  "Practical Capstone",
] as const;

export const routeComparison = [
  {
    route: "Foundational Route",
    designedFor: "New students and applicants who do not meet advanced-entry criteria",
    discipleship: "8 foundational courses",
    skill: "Web Development or Cybersecurity Foundations",
    capstone: "Required",
    entry: "Normal application and admission review",
  },
  {
    route: "Advanced Route",
    designedFor: "Eligible REALMS alumni or approved prior-theological-education applicants",
    discipleship: "All 5 advanced courses",
    skill: "Web Development or Cybersecurity Foundations",
    capstone: "Required",
    entry: "Alumni verification or foundational knowledge screening, followed by admission review",
  },
] as const;

export const advancedDiscipleshipSchedule = {
  title: "Advanced Discipleship",
  sessions: [{ days: "Monday–Wednesday", time: "7:00 PM–9:00 PM" }],
  mode: "Online",
} as const;

export const programmeSchedules = [
  { title: "Web Development", sessions: [{ days: "Monday & Tuesday", time: "3:30 PM–6:00 PM" }], mode: "Physical/Online as approved" },
  { title: "Cybersecurity Foundations", sessions: [{ days: "Wednesday & Friday", time: "3:30 PM–6:00 PM" }], mode: "Physical/Online as approved" },
  { title: "Foundational Discipleship", sessions: [{ days: "Friday", time: "6:30 PM–8:30 PM" }, { days: "Saturday", time: "6:30 PM–8:30 PM" }, { days: "Sunday", time: "8:00 PM–9:30 PM" }], mode: "Online" },
  advancedDiscipleshipSchedule,
] as const;

export const programmeReceives = [
  "Structured discipleship formation through your approved route",
  "Practical skill-pathway training",
  "Live learning sessions",
  "Integrated attendance, participation, integrity and assessment requirements",
  "Prayer and accountability structure",
  "Practical skill capstone",
  "Access to approved learning materials and recordings where applicable",
  schoolOfDiscoveryCertificateStatement,
] as const;

export const programmeAudiences = [
  "New believers seeking biblical foundation",
  "Believers seeking deeper formation",
  "Believers seeking clarity of calling and responsibility",
  "Young ministers and church workers",
  "Marketplace Christians",
  "Students and emerging leaders",
  "REALMS alumni ready for advanced formation",
  "Applicants with previous structured theological or discipleship education seeking advanced-entry consideration",
] as const;
