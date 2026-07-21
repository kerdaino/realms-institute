export const siteConfig = {
  instituteName: "REALMS Institute",
  motto: "Christian Formation and Skill Equipping",
  headline: "Be Formed in God. Be Equipped for Your Field.",
  shortVision:
    "Helping believers grow in God and serve faithfully in every sphere of influence.",
  vision:
    "REALMS Institute is a Christian formation and skill-equipping institute for believers who desire deeper formation in God and practical preparation for faithful service.",
  independenceStatement: "REALMS Institute is an independent Christian formation and training institution.",
} as const;

export const contactEmail = "gloryrealm2025@gmail.com";
export const physicalAddress = "No. 3 Shina Olaogun Street, Agbado";

export const navLinks = [
  { label: "Home", href: "/" },
  { label: "School of Discovery", href: "/schools/discovery" },
  { label: "Admissions", href: "/admissions" },
  { label: "Register", href: "/register" },
  { label: "Contact", href: "/contact" },
] as const;

export const mobileNavLinks = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Schools", href: "/schools" },
  { label: "School of Discovery", href: "/schools/discovery" },
  { label: "Programs", href: "/programs" },
  { label: "Admissions", href: "/admissions" },
  { label: "Cohorts", href: "/cohorts" },
  { label: "Resources", href: "/resources" },
  { label: "Student Portal", href: "/student-portal" },
  { label: "Certificates", href: "/certificates" },
  { label: "Partners", href: "/partners" },
  { label: "Contact", href: "/contact" },
  { label: "Register", href: "/register" },
] as const;

export const cohortPricing = {
  physical: {
    label: "Physical",
    amount: 10000,
    currency: "NGN",
    display: "₦10,000",
  },
  onlineNigeria: {
    label: "Online",
    amount: 15000,
    currency: "NGN",
    display: "₦15,000",
  },
  internationalOnline: {
    label: "International Online",
    publicDisplay: "$20 equivalent",
    amount: 24000,
    currency: "NGN",
    display: "₦24,000",
    exchangeRate: 1200,
    exchangeNote: "International Online: $20 equivalent.",
  },
} as const;

export const whatsappChannelUrl = "https://whatsapp.com/channel/0029VbC6zkX9mrGkzCTXTS0s";

export const feeLabel = "Non-refundable Registration/Application Fee";
export const feeClarification = "The REALMS School of Discovery programme is free after registration. No additional tuition or programme fee will be charged for this cohort.";
export const feePolicyNote = "The registration/application fee is non-refundable and helps cover application processing, cohort preparation, and participation support.";
export const feePricingNote = "Physical Nigeria: ₦10,000, Online Nigeria: ₦15,000, International Online: $20 equivalent / ₦24,000.";
export const computerRequirementText = "Applicants choosing Web Development or Cybersecurity Foundations should have regular access to a laptop or desktop computer. A mobile phone alone will not be sufficient for the practical skill pathway.";
export const computerRequirementShort = "This pathway requires access to a laptop or desktop computer for practical classes, assignments, and exercises.";
export const skillPathwayParticipationNote = "The skill pathway requires practical participation, assignments, and access to a computer.";

export const skillPathways = [
  "Web Development",
  "Cybersecurity Foundations",
] as const;

export const applicantTypeOptions = [
  {
    value: "new_student",
    label: "New Student",
    description: "I have not previously completed the REALMS School of Discovery foundational programme and I am applying for the Foundational Discipleship route.",
  },
  {
    value: "realms_alumnus",
    label: "REALMS Alumnus",
    description: "I previously completed the REALMS School of Discovery foundational programme and would like to be considered for the Advanced Discipleship Programme.",
  },
  {
    value: "prior_theological_education",
    label: "Prior Theological / Discipleship Education",
    description: "I have completed structured theological, Bible-school, seminary, ministry or equivalent discipleship training outside REALMS and would like to be assessed for Advanced Discipleship entry.",
  },
] as const;

export const currentCohortPathways = [
  "Web Development",
  "Cybersecurity Foundations",
] as const;

export const futureSkillPathways = [
  "Cloud Computing",
  "Media & Technology",
  "Kingdom Enterprise",
  "Leadership & Administration",
  "Missions Support Skills",
] as const;

export const learningModes = ["Physical", "Online"] as const;

export const genderOptions = ["Male", "Female"] as const;

export const ageRanges = ["Under 18", "18–24", "25–34", "35–44", "45+"] as const;

export const testimonials = [
  {
    name: "Mrs Terna Promise",
    location: "Nigeria",
    role: "School of Discovery Participant",
    quote: "School of Discovery has helped sharpen my mindset. It has been insightful, and I have experienced self-discovery, discipline, answers to unclarified questions, and a deeper sense of responsibility. I have truly experienced tremendous growth.",
  },
  {
    name: "Miss Funmike",
    location: "United Kingdom",
    role: "School of Discovery Participant",
    quote: "The classes have been very impactful.",
  },
  {
    name: "Mr Ekure Noah",
    location: "Nigeria",
    role: "School of Discovery Participant",
    quote: "The program was a refreshing moment with the Lord. I was truly blessed.",
  },
  {
    name: "Julius Nanor",
    location: "China",
    role: "School of Discovery Participant",
    quote: "The session I joined was good, and I really appreciate that the recordings are available on the site. They make it possible to go back and keep learning.",
  },
  {
    name: "Mrs Priv",
    location: "United Kingdom",
    role: "School of Discovery Participant",
    quote: "The sessions have really challenged and empowered me to get into the Word, meditate, and pray. The teachings brought a different dimension to salvation, identity, and purpose, and having access to recordings has really helped me listen again.",
  },
  {
    name: "Mr Stephen Tobi",
    location: "Nigeria",
    role: "School of Discovery Participant",
    quote: "The sessions have been helpful in bringing back the consciousness of realities I walked in during my early days in the faith. I have also received clarity around responsibilities in the Kingdom.",
  },
] as const;

export const footerLinks = [
  { label: "About", href: "/about" },
  { label: "Programs", href: "/programs" },
  { label: "Resources", href: "/resources" },
  { label: "Student Portal", href: "/student-portal" },
  { label: "Certificates", href: "/certificates" },
  { label: "Partners", href: "/partners" },
] as const;

export const programs = {
  current: [
    { title: "REALMS School of Discovery", description: "One approved discipleship route—Foundational or Advanced—alongside one practical skill pathway." },
    { title: "Web Development Pathway", description: "Practical foundations for building accessible, useful experiences for the web." },
    { title: "Cybersecurity Foundations Pathway", description: "Foundational principles for responsible digital security, awareness, and practice." },
  ],
  future: [
    "Cloud Computing",
    "Media & Technology",
    "Kingdom Enterprise",
    "Leadership & Administration",
    "Missions Support Skills",
  ],
} as const;

export const resources = [
  { title: "Foundations of Identity in Christ", category: "Study Guides" },
  { title: "Prayer and Spiritual Discipline Guide", category: "Prayer Resources" },
  { title: "Discovering Purpose and Assignment", category: "Featured Resources" },
  { title: "Marketplace Stewardship Notes", category: "Marketplace & Stewardship Resources" },
  { title: "Evangelism Practice Guide", category: "Study Guides" },
  { title: "Media, Truth, and Digital Stewardship", category: "Media & Technology Resources" },
] as const;

export const resourceCategories = [
  "Featured Resources",
  "Study Guides",
  "Prayer Resources",
  "Media & Technology Resources",
  "Marketplace & Stewardship Resources",
] as const;

export const portalFeatures = [
  "Student dashboard",
  "Course access",
  "Assignment submission",
  "Quiz and exam access",
  "Attendance tracking",
  "Certificate access",
  "Announcements",
  "Learning progress",
] as const;

export const partnerAreas = [
  "Prayer",
  "Teaching",
  "Media",
  "Technology",
  "Finance",
  "Missions",
  "Student Sponsorship",
  "Infrastructure",
] as const;

export const schools = [
  {
    title: "School of Discovery",
    description:
      "Foundational Discipleship or Advanced Discipleship for eligible students, alongside Web Development or Cybersecurity Foundations.",
    focusAreas: ["Foundational or Advanced Discipleship", "Web Development", "Cybersecurity Foundations"],
    status: "Open · August 2026",
    href: "/schools/discovery",
  },
  {
    title: "School of Media & Technology",
    description:
      "Training believers to build, communicate, and create with wisdom, purity, excellence, and intelligent digital stewardship.",
    focusAreas: ["Media", "Technology", "Digital stewardship"],
    status: "Coming Soon",
  },
  {
    title: "School of Missions",
    description:
      "Formation for gospel witness across campuses, communities, cities, and nations with compassion and spiritual clarity.",
    focusAreas: ["Evangelism", "Cross-cultural mission", "Church planting"],
    status: "Coming Soon",
  },
  {
    title: "School of Leadership & Governance",
    description:
      "Equipping servant leaders to carry truth, justice, discipline, and kingdom intelligence into public responsibility.",
    focusAreas: ["Leadership", "Public service", "Governance"],
    status: "Coming Soon",
  },
  {
    title: "School of Kingdom Enterprise",
    description:
      "Marketplace formation for builders, founders, professionals, and stewards who see work as worship and assignment.",
    focusAreas: ["Enterprise", "Stewardship", "Marketplace mission"],
    status: "Coming Soon",
  },
] as const;

export const formationPillars = [
  {
    title: "Doctrine",
    description:
      "Sound teaching that anchors conviction, corrects confusion, and forms believers in the truth of Christ.",
  },
  {
    title: "Prayer",
    description:
      "A life of communion, consecration, intercession, and spiritual sensitivity before God.",
  },
  {
    title: "Calling",
    description:
      "Discovery of assignment, identity, gifts, burden, and the places where obedience must become visible.",
  },
  {
    title: "Skill & Marketplace Relevance",
    description:
      "Practical excellence that helps believers serve faithfully in media, technology, business, governance, and culture.",
  },
] as const;

export const visionCards = [
  {
    title: "Formation",
    description:
      "Beyond attendance into maturity, purity, prayer, doctrine, and a life shaped by Christ.",
  },
  {
    title: "Deployment",
    description:
      "Believers prepared to serve families, campuses, missions, communities, and strategic spheres.",
  },
  {
    title: "Influence",
    description:
      "Believers carrying wisdom, excellence, and faithful Christian witness into public life.",
  },
] as const;

export const admissionProcess = [
  { title: "Apply Online", description: "Applications are open for the August 2026 School of Discovery cohort. Select the applicant path that truthfully describes your background and choose one practical skill pathway." },
  { title: `Pay ${feeLabel}`, description: "Proceed to secure Paystack checkout so REALMS Institute can process your application for review." },
  { title: "Application Review", description: "REALMS Institute reviews your application and contacts you with admission/onboarding status and next steps." },
  { title: "Review Schedule & Join Onboarding", description: "Review the published August 2026 schedule and, if admitted, follow the onboarding instructions provided by REALMS Institute." },
  { title: "Begin Formation", description: "Enter the cohort ready for learning, prayer, accountability, and obedience." },
] as const;

export const admissionRequirements = [
  "Hunger for spiritual growth",
  "Willingness to learn and submit to structure",
  "Commitment to prayer and assignments",
  "Access to WhatsApp and internet for online students",
  computerRequirementText,
  "Openness to discipleship and correction",
] as const;

export const cohortExpectations = [
  "Live teaching",
  "Prayer sessions",
  "Attendance and participation",
  "Integrity and assessment requirements",
  "Skill development",
  "Practical skill capstone",
] as const;

export const impactStats = [
  "Christian Formation Institute",
  "Practical Skills: Physical or Online",
  "Discipleship: Online",
  "2 Practical Skill Pathways",
] as const;

export const formationJourney = [
  {
    title: "Encounter",
    description:
      "Awakening to the person of Christ, the life of prayer, and the Father's call to a consecrated life.",
  },
  {
    title: "Formation",
    description:
      "Being shaped by sound doctrine, discipleship, purity, spiritual discipline, and a Christ-centred community.",
  },
  {
    title: "Equipping",
    description:
      "Developing calling clarity, character, leadership capacity, and relevant skill for faithful service.",
  },
  {
    title: "Deployment",
    description:
      "Carrying the glory, wisdom, and mission of Christ into the Church, the nations, and every sphere of society.",
  },
] as const;

export const spheresOfInfluence = [
  "Family",
  "Campus",
  "Church",
  "Media",
  "Technology",
  "Business",
  "Missions",
  "Governance",
] as const;
