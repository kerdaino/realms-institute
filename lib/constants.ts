export const siteConfig = {
  instituteName: "REALMS Institute",
  motto: "Bringing the Will of the Father into the Earth Realm",
  headline: "Raising Glory-Revealing Christians for Every Sphere of Influence",
  shortVision:
    "Raising glory-revealing Christians in every sphere of influence.",
  vision:
    "REALMS Institute is not just a learning platform. It is a formation system for believers who want to become useful to God in their generation—rooted in discipleship, doctrine, prayer, purity, calling, and practical obedience.",
  poweredBy: "Powered by Gloryrealm Christian Centre",
} as const;

export const navLinks = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Schools", href: "/schools" },
  { label: "Programs", href: "/programs" },
  { label: "Admissions", href: "/admissions" },
  { label: "Cohorts", href: "/cohorts" },
  { label: "Resources", href: "/resources" },
  { label: "Contact", href: "/contact" },
  { label: "Register", href: "/register" },
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
    amount: 20,
    currency: "USD",
    display: "$20",
  },
} as const;

export const skillPathways = [
  "Web Development",
  "Cybersecurity Foundations",
  "Not sure yet",
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
  "Creative Communication",
] as const;

export const learningModes = ["Physical", "Online"] as const;

export const genderOptions = ["Male", "Female"] as const;

export const ageRanges = ["Under 18", "18–24", "25–34", "35–44", "45+"] as const;

export const testimonials = [
  {
    quote: "School of Discovery helped me become more intentional about my walk with God, prayer life, and understanding of purpose.",
    name: "Cohort 1 Student",
    role: "School of Discovery Participant",
  },
  {
    quote: "The teachings and assignments helped me think more seriously about calling, discipline, and being useful to God beyond church attendance.",
    name: "School of Discovery Participant",
    role: "First Cohort",
  },
  {
    quote: "The cohort gave me structure, accountability, and a clearer hunger to grow in doctrine, prayer, and service.",
    name: "Graduate, First Cohort",
    role: "School of Discovery",
  },
] as const;

export const discoveryCore = [
  "Gospel & New Creation",
  "Identity in Christ",
  "Doctrine Foundations",
  "Prayer & Spiritual Discipline",
  "Calling & Assignment",
  "Evangelism",
  "Stewardship",
  "Christian Character",
] as const;

export const discoverySkillPathways = [
  "Web Development",
  "Cybersecurity Foundations",
] as const;

export const discoveryStudentReceives = [
  "Institute-issued certificate of completion in Discipleship & Theology Formation",
  "Institute-issued certificate of completion in selected skill pathway",
  "Access to live classes",
  "Assignments and assessments",
  "Prayer and accountability structure",
] as const;

export const footerLinks = [
  { label: "Student Portal", href: "/student-portal" },
  { label: "Certificates", href: "/certificates" },
  { label: "Partners", href: "/partners" },
] as const;

export const programs = {
  current: [
    { title: "Realms School of Discovery", description: "Integrated Christian formation through a Theology & Discipleship Core and a practical skill pathway." },
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

export const certificateRequirements = [
  "Required learning",
  "Assignments",
  "Quizzes",
  "Assessments",
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
      "Foundational discipleship for identity, calling, prayer, doctrine, evangelism, stewardship, and marketplace assignment.",
    focusAreas: ["Identity", "Calling", "Spiritual disciplines"],
    status: "Foundational",
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
      "Glory-revealing Christians carrying wisdom, excellence, and truth into public life.",
  },
] as const;

export const discoveryModules = [
  "Gospel & New Creation",
  "Identity in Christ",
  "Calling & Assignment",
  "Purpose Discovery",
  "Prayer & Spiritual Discipline",
  "The Word & Study",
  "Evangelism",
  "Stewardship & Marketplace Relevance",
] as const;

export const discoveryAudiences = [
  "New believers seeking foundation",
  "Believers seeking clarity of calling",
  "Young ministers and workers",
  "Marketplace Christians",
  "Students and emerging leaders",
] as const;

export const discoveryOutcomes = [
  "Biblical foundation",
  "Personal devotion",
  "Clarity of assignment",
  "Evangelistic burden",
  "Stewardship",
  "Disciplined Christian living",
  "Marketplace usefulness",
] as const;

export const discoveryLearningFormat = [
  "Physical or Online",
  "Live sessions",
  "Assignments",
  "Prayer emphasis",
  "Quizzes and exams",
  "Certificate of completion",
] as const;

export const admissionProcess = [
  { title: "Apply Online", description: "Complete the cohort application with your contact and pathway details." },
  { title: "Pay Registration Fee", description: "Proceed to secure Paystack checkout to confirm your application interest." },
  { title: "Receive Confirmation", description: "Receive confirmation and further cohort information from REALMS Institute." },
  { title: "Join Onboarding / Orientation", description: "Understand the formation culture, schedule, expectations, and learning structure." },
  { title: "Begin Formation", description: "Enter the cohort ready for learning, prayer, accountability, and obedience." },
] as const;

export const admissionRequirements = [
  "Hunger for spiritual growth",
  "Willingness to learn and submit to structure",
  "Commitment to prayer and assignments",
  "Access to WhatsApp and internet for online students",
  "Openness to discipleship and correction",
] as const;

export const cohortExpectations = [
  "Live teaching",
  "Prayer sessions",
  "Assignments",
  "Community accountability",
  "Skill development",
  "Certificate of completion",
] as const;

export const impactStats = [
  "5 Schools of Formation",
  "Physical or Online Cohorts",
  "Doctrine • Prayer • Skill",
  "Missions & Marketplace Focus",
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
