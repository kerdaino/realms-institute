import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { lateRegistrationInviteStatus, normalizeInviteEmail, registrationAvailability, registrationClosedMessage, validRegistrationWindow } from "../lib/registrationControl.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
let passed = 0;
function test(name, run) { run(); passed += 1; console.log(`PASS ${name}`); }

const base = { registration_status: "open", registration_opens_at: null, registration_closes_at: null };
test("manual open with no window accepts registration", () => assert.deepEqual(registrationAvailability(base, new Date("2026-08-12T12:00:00Z")), { isOpen: true, reason: "open" }));
test("manual close remains authoritative", () => assert.equal(registrationAvailability({ ...base, registration_status: "closed" }, new Date()).reason, "manually_closed"));
test("future opening blocks an otherwise open cohort", () => assert.equal(registrationAvailability({ ...base, registration_opens_at: "2026-08-13T00:00:00Z" }, new Date("2026-08-12T00:00:00Z")).reason, "not_yet_open"));
test("configured close blocks at its boundary", () => assert.equal(registrationAvailability({ ...base, registration_closes_at: "2026-08-12T12:00:00Z" }, new Date("2026-08-12T12:00:00Z")).reason, "window_closed"));
test("registration can be reopened after manual close", () => assert.equal(registrationAvailability({ ...base, registration_status: "open" }).isOpen, true));
test("registration window ordering is validated", () => { assert.equal(validRegistrationWindow("2026-08-12T12:00:00Z", "2026-08-12T11:59:59Z"), false); assert.equal(validRegistrationWindow(null, null), true); });
test("invite email comparison normalizes case and whitespace", () => assert.equal(normalizeInviteEmail(" Applicant@Example.COM "), "applicant@example.com"));
test("active invite is active", () => assert.equal(lateRegistrationInviteStatus({ expires_at: "2026-08-13T00:00:00Z", revoked_at: null, consumed_at: null }, new Date("2026-08-12T00:00:00Z")), "active"));
test("expired invite is rejected", () => assert.equal(lateRegistrationInviteStatus({ expires_at: "2026-08-11T00:00:00Z", revoked_at: null, consumed_at: null }, new Date("2026-08-12T00:00:00Z")), "expired"));
test("revoked invite is rejected", () => assert.equal(lateRegistrationInviteStatus({ expires_at: "2026-08-13T00:00:00Z", revoked_at: "2026-08-12T00:00:00Z", consumed_at: null }, new Date("2026-08-12T00:00:00Z")), "revoked"));
test("consumed invite cannot be reused", () => assert.equal(lateRegistrationInviteStatus({ expires_at: "2026-08-13T00:00:00Z", revoked_at: null, consumed_at: "2026-08-12T00:00:00Z" }, new Date("2026-08-12T00:00:00Z")), "used"));
test("closed response is applicant friendly", () => assert.equal(registrationClosedMessage, "Registration for this cohort is currently closed."));

const publicPage = read("app/register/page.tsx");
const invitePage = read("app/register/invite/[token]/page.tsx");
const selfPay = read("app/api/paystack/initialize/route.ts");
const scholarship = read("app/api/registrations/scholarship/route.ts");
const server = read("lib/registrationControl.server.ts");
const save = read("lib/saveRegistration.ts");
const migration = read("supabase/cohort_registration_control.sql");
const cohortAdmin = read("components/admin/CohortRecord.tsx");
const cohortApi = read("app/api/admin/cohorts/[id]/registration/route.ts");
const inviteApi = read("app/api/admin/cohorts/[id]/late-registration-invites/route.ts");
const revokeApi = read("app/api/admin/cohorts/[id]/late-registration-invites/[inviteId]/revoke/route.ts");

test("closed public page does not render the form", () => assert.match(publicPage, /if \(state\.kind === "closed"\)[\s\S]+Registration Closed[\s\S]+<RegistrationForm/));
test("self-pay endpoint authorizes before validation and creation", () => { const authorization = selfPay.indexOf("authorization = await authorizeRegistrationRequest"); assert.ok(authorization < selfPay.indexOf("const validation = validateRegistrationPayload") && authorization < selfPay.indexOf("application = await createRegistrationApplication")); });
test("scholarship endpoint authorizes before validation and creation", () => { const authorization = scholarship.indexOf("authorization = await authorizeRegistrationRequest"); assert.ok(authorization < scholarship.indexOf("const validation = validateRegistrationPayload") && authorization < scholarship.indexOf("const application = await createRegistrationApplication")); });
test("both public creation endpoints return the closure message", () => { assert.match(selfPay, /Registration for this cohort is currently closed/); assert.match(scholarship, /Registration for this cohort is currently closed/); });
test("target cohort must be the one public cohort", () => assert.match(server, /state\.cohort\.id !== input\.cohortId/));
test("private invite binds token cohort and email", () => { assert.match(server, /invite\.cohort_id !== input\.cohortId/); assert.match(server, /normalizeInviteEmail\(invite\.applicant_email\)[\s\S]+normalizeInviteEmail\(input\.applicantEmail\)/); });
test("private invite token is random hashed and encrypted at rest", () => { assert.match(server, /randomBytes\(32\)/); assert.match(server, /createHash\("sha256"\)/); assert.match(server, /createCipheriv\("aes-256-gcm"/); });
test("invite page locks the authorised email into the form", () => { assert.match(invitePage, /authorisedEmail=\{state\.applicantEmail\}/); assert.match(invitePage, /inviteToken=\{token\}/); });
test("new applications persist exact cohort id and code", () => { assert.match(save, /cohort_id: cohort\.id/); assert.match(save, /cohort_code: cohort\.code/); });
test("duplicate checks remain scoped to exact cohort", () => assert.match(save, /\.eq\("cohort_code", options\.cohort\.code\)/));
test("database allows only one public registration cohort", () => assert.match(migration, /unique index[\s\S]+cohorts_single_public_registration_idx[\s\S]+where is_public_registration_cohort/i));
test("database enforces closure and invite rules at insert", () => { assert.match(migration, /before insert[\s\S]+enforce_new_registration_access/i); assert.match(migration, /REGISTRATION_CLOSED/); assert.match(migration, /lower\(btrim\(invite\.applicant_email\)\)/); });
test("migration-first deployment keeps legacy cohort-code submissions compatible", () => { assert.match(migration, /if new\.cohort_id is null[\s\S]+where code = new\.cohort_code[\s\S]+new\.cohort_id := target_cohort\.id/i); });
test("database consumes invite atomically with application insert", () => { assert.match(migration, /after insert[\s\S]+consume_new_registration_invite/i); assert.match(migration, /consumed_registration_id = new\.id/); });
test("existing payment flows are not gated by cohort registration status", () => { assert.doesNotMatch(read("lib/scholarshipPayment.server.ts"), /registrationAvailability|registration_status/); assert.doesNotMatch(read("app/api/paystack/verify/route.ts"), /registrationAvailability|registration_status/); });
test("advanced entry and admission administration remain independent", () => { assert.doesNotMatch(read("app/api/admin/registrations/[id]/advanced-entry-decision-email/route.ts"), /registrationAvailability|registration_status/); assert.doesNotMatch(read("app/api/admin/registrations/[id]/status/route.ts"), /registrationAvailability|registration_status/); });
test("admin registration changes require authentication", () => assert.match(cohortApi, /isAdminAuthenticated/));
test("admin invite create and revoke require authentication", () => { assert.match(inviteApi, /isAdminAuthenticated/); assert.match(revokeApi, /isAdminAuthenticated/); });
test("close confirmation preserves existing workflow wording", () => assert.match(cohortAdmin, /Existing applications, payments, scholarship decisions and admission records will not be affected/));
test("audit actions cover registration and invite lifecycle", () => ["registration_opened", "registration_closed", "public_registration_cohort_changed", "late_registration_invite_created", "late_registration_invite_revoked", "late_registration_invite_consumed"].forEach((action) => assert.match(`${server}\n${migration}`, new RegExp(action))));
test("migration preserves August registration until admin manually closes it", () => { assert.match(migration, /code = 'RSD-AUG-2026'/); assert.match(migration, /registration_status = 'open'/); });

console.log(`Registration control tests passed: ${passed}`);
