import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { applicationStatuses } from "../lib/applicationStatus.ts";
import { august2026CohortDates, august2026CohortEvents, august2026Sessions } from "../lib/lms/august2026Calendar.ts";
import { announcementIsPinned, isActiveAnnouncement, normalizeRecipientEmail } from "../lib/lms/institutionalAnnouncements.ts";
import { isFinancialRequirementSatisfied, scholarshipFinancialSummary } from "../lib/scholarshipFinance.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [conditionalAdmission, statusRoute, deadlineRoute, lifecycle, provisioning, announcementService, migration, announcementPage, studentPage, facilitatorPage, deadlineScript] = await Promise.all([
  read("lib/conditionalAdmission.ts"), read("app/api/admin/registrations/[id]/status/route.ts"), read("app/api/admin/registrations/[id]/payment-deadline/route.ts"), read("lib/conditionalAdmissionLifecycle.server.ts"), read("lib/lms/provisionStudent.ts"), read("lib/lms/institutionalAnnouncementService.server.ts"), read("supabase/august_2026_operational_update.sql"), read("app/admin/announcements/page.tsx"), read("app/student/page.tsx"), read("app/facilitator/page.tsx"), read("scripts/process-admission-deadlines.mjs"),
]);

assert.equal(new Date(Date.parse("2026-08-01T10:15:00+01:00") + 14 * 24 * 60 * 60 * 1000).toISOString(), "2026-08-15T09:15:00.000Z");
assert.equal(isFinancialRequirementSatisfied({ amount: 10_000, amount_paid: 10_000, payment_status: "success", funding_route: "self_pay" }), true);
assert.equal(isFinancialRequirementSatisfied({ amount: 10_000, payment_status: "not_paid", financial_requirement_status: "satisfied_by_scholarship", funding_route: "scholarship_request", scholarship_status: "approved_full", scholarship_approved_amount: 10_000 }), true);
assert.equal(scholarshipFinancialSummary({ normalFee: 15_000, scholarshipStatus: "approved_partial", approvedScholarshipAmount: 9_000, amountPaid: null, paymentStatus: "not_paid" }).amountDue, 6_000);
assert.match(conditionalAdmission, /conditionalAdmissionDeadlineDays = 14/);
assert.match(conditionalAdmission, /assigned_discipleship_route/);
assert.match(conditionalAdmission, /registrationFinancialSummary/);
assert.match(conditionalAdmission, /august2026ClassStartAt = "2026-08-17T00:00:00\+01:00"/);
assert.ok(applicationStatuses.includes("conditional_admission_payment_outstanding"));
assert.ok(applicationStatuses.includes("admission_offer_lapsed_payment_outstanding"));
assert.match(statusRoute, /conditionalAdmissionEligibility/);
assert.match(statusRoute, /paymentDeadlineFromOffer\(decisionAt\)/);
assert.match(statusRoute, /isFinancialRequirementSatisfied/);
assert.match(deadlineRoute, /reactivated: false/);
assert.match(lifecycle, /Date\.parse\(paidAt\) > Date\.parse\(current\.data\.admission_payment_deadline\)/);
assert.match(lifecycle, /conditional_admission_payment_received_after_deadline/);
assert.match(provisioning, /application_status !== "admitted"/);
assert.match(provisioning, /isFinancialRequirementSatisfied/);
assert.match(deadlineScript, /process\.argv\.includes\("--apply"\)/);
assert.match(deadlineScript, /ADMISSION_DEADLINES_APPLY/);

assert.deepEqual(august2026CohortDates, { startDate: "2026-08-17", endDate: "2026-10-18", orientationDate: "2026-08-14", matriculationDate: "2026-08-16", finalCompletionStartDate: "2026-10-12", finalCompletionEndDate: "2026-10-17", graduationDate: "2026-10-18", graduationTime: null });
assert.equal(august2026Sessions.length, 80);
assert.equal(august2026Sessions.find((session) => session.courseCode === "RSD-WEB 101")?.scheduledStartAt, "2026-08-17T14:30:00.000Z");
assert.equal(august2026Sessions.find((session) => session.courseCode === "RSD-CYB 101")?.scheduledStartAt, "2026-08-19T14:30:00.000Z");
assert.equal(august2026CohortEvents[1].scheduledStartAt, null);

assert.equal(normalizeRecipientEmail(" Person@Example.COM "), "person@example.com");
assert.equal(isActiveAnnouncement({ announcement_status: "published", publish_to_portal: true, published_at: "2026-08-01T00:00:00Z", expires_at: "2026-09-01T00:00:00Z" }, new Date("2026-08-11T00:00:00Z")), true);
assert.equal(isActiveAnnouncement({ announcement_status: "published", publish_to_portal: true, published_at: "2026-08-01T00:00:00Z", expires_at: "2026-08-10T00:00:00Z" }, new Date("2026-08-11T00:00:00Z")), false);
assert.equal(announcementIsPinned({ pinned_until: "2026-08-12T00:00:00Z" }, new Date("2026-08-11T00:00:00Z")), true);
assert.match(announcementService, /student_status !== "active"/);
assert.match(announcementService, /facilitator_status !== "active"/);
assert.match(announcementService, /normalizeRecipientEmail/);
assert.match(announcementService, /email_attempt_count/);
assert.match(announcementService, /failedOnly/);
assert.match(migration, /create table if not exists public\.institutional_announcements/);
assert.match(migration, /create table if not exists public\.institutional_announcement_recipients/);
assert.match(migration, /revoke all on public\.institutional_announcements, public\.institutional_announcement_recipients from anon, authenticated/);
assert.match(announcementPage, /await requireAdmin\(\)/);
assert.match(studentPage, /await requireRole\("student"\)/);
assert.match(studentPage, /fetchStudentInstitutionalAnnouncements/);
assert.match(facilitatorPage, /await requireRole\("facilitator"\)/);
assert.match(facilitatorPage, /fetchFacilitatorInstitutionalAnnouncements/);

console.log("August 2026 operational checks passed (conditional admission, calendar, announcements, security, and portal visibility).");
