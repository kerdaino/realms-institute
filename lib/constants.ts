export const siteConfig = {
  instituteName: "REALMS Institute",
  motto: "Christian Formation and Skill Equipping",
  headline: "Be Formed in God. Be Equipped for Your Field.",
  shortVision:
    "Helping believers grow in God and serve faithfully in every sphere of influence.",
  vision:
    "REALMS Institute is a Christian formation and skill-equipping institute for believers who desire deeper formation in God and practical preparation for faithful service.",
  poweredBy: "Powered by Gloryrealm Christian Centre",
} as const;

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
  "Institute-issued certificate of completion in the selected Skill Pathway",
  "Access to live classes",
  "Assignments and assessments",
  "Prayer and accountability structure",
] as const;

export const certificateNote = "Certificates are issued by REALMS Institute as records of completed learning requirements.";

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
    { title: "REALMS School of Discovery", description: "Integrated Christian formation through Discipleship & Theology Formation and one practical skill pathway." },
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
      "Believers carrying wisdom, excellence, and faithful Christian witness into public life.",
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
  "Institute-issued certificates of completion",
] as const;

export const admissionProcess = [
  { title: "Apply Online", description: "Complete the cohort application with your contact and pathway details." },
  { title: "Pay Registration and Cohort Participation Fee", description: "Proceed to secure Paystack checkout to confirm your registration interest and support cohort participation." },
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
  "Institute-issued certificates of completion",
] as const;

export const impactStats = [
  "Christian Formation Institute",
  "Physical + Online",
  "Discipleship Core",
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
