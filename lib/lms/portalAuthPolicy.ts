export type PortalSetupContext = "student" | "facilitator" | "recovery";
export type PortalLinkIntent = "setup" | "signin";

export function isPortalSetupContext(value: unknown): value is PortalSetupContext {
  return value === "student" || value === "facilitator" || value === "recovery";
}

export function isPortalLinkIntent(value: unknown): value is PortalLinkIntent {
  return value === "setup" || value === "signin";
}

export function normalizePortalSetupContext(value: unknown): PortalSetupContext {
  return isPortalSetupContext(value) ? value : "recovery";
}

export function normalizePortalLinkIntent(value: unknown): PortalLinkIntent {
  return isPortalLinkIntent(value) ? value : "signin";
}

export function validatePortalPassword(password: string) {
  const requirements = [
    { met: password.length >= 12, message: "Use at least 12 characters." },
    { met: /[a-z]/.test(password), message: "Include a lowercase letter." },
    { met: /[A-Z]/.test(password), message: "Include an uppercase letter." },
    { met: /\d/.test(password), message: "Include a number." },
    { met: /[^A-Za-z0-9]/.test(password), message: "Include a symbol." },
  ];
  return { valid: requirements.every((item) => item.met), requirements };
}
