export const realmTokens = {
  colors: {
    navy: "#050d1c",
    gold: "#d7aa45",
    white: "#f8fbff",
    surface: "rgba(12, 28, 54, 0.68)",
    surfaceAlt: "rgba(255, 255, 255, 0.055)",
    background: "#050d1c",
    border: "rgba(255, 255, 255, 0.12)",
    mutedText: "#b7c2d6",
    success: "#66d9a5",
    warning: "#f2c66d",
  },
  spacing: {
    xs: "0.5rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
    "2xl": "3rem",
    "3xl": "4.5rem",
    "4xl": "6rem",
  },
  radius: {
    sm: "0.75rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
    full: "9999px",
  },
  shadows: {
    sm: "0 14px 40px rgba(0, 0, 0, 0.22)",
    md: "0 24px 80px rgba(0, 0, 0, 0.28)",
    lg: "0 36px 120px rgba(0, 0, 0, 0.36)",
  },
  glows: {
    gold: "0 0 48px rgba(215, 170, 69, 0.28)",
    blue: "0 0 64px rgba(75, 116, 196, 0.22)",
    soft: "0 0 32px rgba(248, 251, 255, 0.08)",
  },
  durations: {
    fast: 160,
    base: 240,
    slow: 520,
    ambient: 9000,
  },
  easing: {
    standard: [0.22, 1, 0.36, 1],
    smooth: [0.16, 1, 0.3, 1],
  },
  containers: {
    page: "max-w-7xl",
    text: "max-w-3xl",
    narrow: "max-w-5xl",
  },
  zIndex: {
    base: 0,
    background: -20,
    content: 10,
    nav: 50,
    overlay: 80,
  },
} as const;

export const realmClasses = {
  container: "mx-auto w-full max-w-7xl px-5 md:px-8",
  section: "relative isolate overflow-hidden py-20 md:py-28",
  glass:
    "border border-[var(--realm-border)] bg-[linear-gradient(145deg,rgba(255,255,255,0.09),rgba(255,255,255,0.026)),var(--realm-surface)] shadow-[var(--realm-shadow-md)] backdrop-blur-xl",
  glassStrong:
    "border border-[var(--realm-border-strong)] bg-[linear-gradient(145deg,rgba(255,255,255,0.12),rgba(255,255,255,0.032)),rgba(7,21,39,0.74)] shadow-[var(--realm-shadow-lg)] backdrop-blur-2xl",
  focus:
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--realm-gold)]",
  cardHover:
    "transition duration-[var(--realm-duration-base)] ease-[var(--realm-ease)] hover:-translate-y-1 hover:border-[var(--realm-gold)]/35 hover:shadow-[var(--realm-glow-gold)]",
  headingHero:
    "text-5xl font-semibold leading-[0.96] tracking-tight text-[var(--realm-white)] sm:text-6xl lg:text-7xl xl:text-8xl",
  headingSection:
    "text-3xl font-semibold tracking-tight text-[var(--realm-white)] md:text-5xl",
  headingCard: "text-lg font-semibold tracking-tight text-[var(--realm-white)]",
  body: "text-base leading-8 text-[var(--realm-muted)] md:text-lg",
  caption:
    "text-xs font-semibold uppercase tracking-[0.22em] text-[var(--realm-gold-soft)]",
} as const;

export const realmMotion = {
  fadeUp: {
    hidden: { opacity: 0, y: 22 },
    visible: { opacity: 1, y: 0 },
  },
  fadeIn: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  staggerChildren: {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.08,
      },
    },
  },
  hoverLift: {
    y: -4,
    transition: { duration: 0.2 },
  },
  hoverGlow: {
    boxShadow: realmTokens.glows.gold,
    transition: { duration: 0.2 },
  },
  buttonPress: {
    scale: 0.98,
  },
} as const;
