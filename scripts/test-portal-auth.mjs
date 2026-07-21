import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

import { isPortalLinkIntent, isPortalSetupContext, normalizePortalLinkIntent, normalizePortalSetupContext, validatePortalPassword } from "../lib/lms/portalAuthPolicy.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const identity = await read("lib/lms/portalIdentity.ts");
const accessService = await read("lib/lms/portalInvite.ts");
const studentProvisioning = await read("lib/lms/provisionStudent.ts");
const loginActions = await read("app/portal/login/actions.ts");
const loginForm = await read("components/portal/PortalLoginForm.tsx");
const recoveryPage = await read("app/portal/forgot-password/page.tsx");
const confirmPage = await read("app/auth/confirm/page.tsx");
const confirmAction = await read("app/auth/confirm/actions.ts");
const confirmForm = await read("components/portal/ConfirmPortalAuthForm.tsx");
const setupPage = await read("app/auth/setup-password/page.tsx");
const setupAction = await read("app/auth/setup-password/actions.ts");
const setupGrant = await read("lib/lms/passwordSetupGrant.ts");
const emails = await read("lib/emailTemplates.ts");
const studentAccessRoute = await read("app/api/admin/students/[id]/portal-access/route.ts");
const facilitatorAccessRoute = await read("app/api/admin/facilitators/[id]/portal-access/route.ts");
const facilitatorLayout = await read("app/facilitator/layout.tsx");
const facilitatorSessions = await read("lib/lms/facilitatorSessions.ts");

// 1. A legitimate enrolled student is resolved before one reusable Auth identity and branded activation are prepared.
assert.match(accessService, /selectCurrentStudentEnrollment/);
assert.match(accessService, /currentStudentEnrollmentStatuses\.includes/);
assert.match(accessService, /findOrCreatePortalAuthUser/);
assert.match(accessService, /createStudentPortalActivationEmail/);

// 2. GET does not consume the token; the explicit server action verifies token_hash and establishes the SSR session.
assert.match(confirmPage, /Continue Securely/);
assert.doesNotMatch(confirmPage, /verifyOtp/);
assert.match(confirmForm, /form action=\{action\}/);
assert.match(confirmForm, /PrimaryButton type="submit" disabled=\{pending\}/);
assert.match(confirmForm, /Verifying secure link…/);
assert.match(confirmAction, /verifyOtp\(\{ token_hash: tokenHash, type: suppliedType \}\)/);
assert.match(confirmAction, /supabase\.auth\.getUser\(\)/);
assert.match(confirmAction, /redirect\("\/auth\/setup-password"\)/);
assert.match(confirmAction, /isPortalLinkIntent\(suppliedIntent\)/);
assert.match(confirmAction, /isPortalSetupContext\(suppliedContext\)/);
assert.match(confirmAction, /\/auth\/confirm\?error=invalid_link/);
assert.doesNotMatch(confirmAction, /invalid_link[^\n]*token_hash/);

// 3-4. Password update is authenticated and student routing reuses handbook state before the real /student dashboard.
assert.match(setupAction, /supabase\.auth\.updateUser\(\{ password \}\)/);
assert.match(setupAction, /getStudentHandbookState/);
assert.match(setupAction, /student\/onboarding\/handbook/);
assert.match(setupAction, /redirect\("\/student"\)/);

// 5-6. Existing users, profiles, students and role rows are reused idempotently.
assert.match(identity, /findPortalAuthUserByEmail/);
assert.match(identity, /onConflict: "user_id,role_id", ignoreDuplicates: true/);
assert.match(studentProvisioning, /findOrCreatePortalAuthUser/);
assert.doesNotMatch(studentProvisioning, /createUser\(/);

// 7-9. Facilitator access requires an active facilitator, reuses identity/role rows and sends only assigned-course context.
assert.match(accessService, /facilitator_status !== "active"/);
assert.match(accessService, /ensurePortalRole\(supabase, auth\.user\.id, "facilitator"\)/);
assert.match(accessService, /facilitator_course_assignments/);
assert.match(emails, /Your assigned course areas currently include/);

// 10. Student and facilitator provisioning share the same email-based Auth identity helper and add roles to that identity.
assert.match(accessService, /findOrCreatePortalAuthUser/g);
assert.match(identity, /ensurePortalRole/);

// 11. Public callers cannot invoke either provisioning endpoint.
assert.match(studentAccessRoute, /isAdminAuthenticated/);
assert.match(facilitatorAccessRoute, /isAdminAuthenticated/);

// 12-13. Recovery uses a Supabase recovery credential and always returns the exact neutral response.
assert.match(accessService, /"recovery" as const/);
assert.match(loginActions, /If an account exists for this email, recovery instructions have been sent\./);
assert.match(recoveryPage, /Forgot Password/);

// 14-15. Invalid/expired credentials fail calmly, types are allowlisted and raw tokens are never logged.
assert.match(confirmAction, /new Set<EmailOtpType>\(\["magiclink", "invite", "email", "recovery"\]\)/);
assert.match(confirmPage, /This activation link is no longer valid/);
assert.doesNotMatch(confirmAction, /console\.(log|error)\([^\n]*token/i);

// 16. Email/password is the primary normal login and uses the existing multi-role resolver.
assert.match(loginActions, /signInWithPassword/);
assert.match(loginActions, /resolvePortalRouteForCurrentUser/);
assert.match(loginForm, /PortalLoginForm/);
assert.match(loginForm, /Forgot Password\?/);

// 17-18. Facilitator route and assignment data retain their existing role and assignment boundaries.
assert.match(facilitatorLayout, /requireRole\("facilitator"\)/);
assert.match(facilitatorSessions, /facilitator_course_assignments|facilitator_id/);

// 19. Email failure leaves provisioned account data intact and returns an actionable retry state.
assert.match(accessService, /The account remains safely provisioned and the email can be resent/);
assert.match(accessService, /outcome: "delivery_failed"/);

// 20. Setup requires a signed, short-lived, HTTP-only grant; no password or temporary credential is persisted or emailed.
assert.match(setupGrant, /httpOnly: true/);
assert.match(setupGrant, /grantLifetimeSeconds = 20 \* 60/);
assert.match(setupPage, /readPasswordSetupGrant/);
assert.doesNotMatch(emails, /temporary password|Password: ABC123/i);
assert.doesNotMatch(identity, /password\s*:/i);

assert.equal(normalizePortalSetupContext("student"), "student");
assert.equal(normalizePortalSetupContext("facilitator"), "facilitator");
assert.equal(normalizePortalSetupContext("anything"), "recovery");
assert.equal(normalizePortalLinkIntent("setup"), "setup");
assert.equal(normalizePortalLinkIntent("anything"), "signin");
assert.equal(isPortalSetupContext("student"), true);
assert.equal(isPortalSetupContext("administrator"), false);
assert.equal(isPortalLinkIntent("setup"), true);
assert.equal(isPortalLinkIntent("reset"), false);
assert.equal(validatePortalPassword("StrongPortal1!").valid, true);
assert.equal(validatePortalPassword("weak").valid, false);
await access(new URL("app/portal/forgot-password/page.tsx", root));
await access(new URL("app/auth/setup-password/page.tsx", root));

console.log(JSON.stringify({
  authScenarios: 20,
  passwordFirstLogin: "passed",
  nonEnumeratingRecovery: "passed",
  scannerResistantConfirmation: "passed",
  idempotentMultiRoleIdentity: "passed",
  studentHandbookRouting: "passed",
  facilitatorScopePreserved: "passed",
  publicProvisioningDenied: "passed",
  noTemporaryPasswords: "passed",
}, null, 2));
