export const PUBLIC_RATE_LIMIT_MESSAGE = "Too many attempts were received. Please wait a little and try again.";

export const publicRateLimitPolicies = {
  registration_source: { limit: 12, windowSeconds: 15 * 60 },
  registration_email: { limit: 4, windowSeconds: 24 * 60 * 60 },
  scholarship_source: { limit: 6, windowSeconds: 60 * 60 },
  scholarship_email: { limit: 3, windowSeconds: 24 * 60 * 60 },
  paystack_initialize_source: { limit: 8, windowSeconds: 15 * 60 },
  paystack_initialize_email: { limit: 4, windowSeconds: 60 * 60 },
  paystack_verify_source: { limit: 60, windowSeconds: 10 * 60 },
  paystack_verify_reference: { limit: 20, windowSeconds: 10 * 60 },
  forgot_password_source: { limit: 10, windowSeconds: 15 * 60 },
  forgot_password_email: { limit: 3, windowSeconds: 60 * 60 },
  activation_resend_source: { limit: 10, windowSeconds: 15 * 60 },
  activation_resend_email: { limit: 3, windowSeconds: 60 * 60 },
  magic_link_source: { limit: 10, windowSeconds: 15 * 60 },
  magic_link_email: { limit: 3, windowSeconds: 60 * 60 },
  certificate_source: { limit: 20, windowSeconds: 60 },
  admin_login_source: { limit: 5, windowSeconds: 15 * 60 },
} as const;

export type PublicRateLimitPolicy = keyof typeof publicRateLimitPolicies;

export type PublicRateLimitResult =
  | { status: "allowed"; retryAfterSeconds: 0 }
  | { status: "blocked"; retryAfterSeconds: number }
  | { status: "unavailable"; retryAfterSeconds: 0 };
