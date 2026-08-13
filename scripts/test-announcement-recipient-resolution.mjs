import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  applicationMatchesStudentRecipientStatus,
  cohortCanReceiveAnnouncements,
  isCurrentStudentEnrollment,
  summarizeAnnouncementRecipients,
} from "../lib/lms/institutionalAnnouncements.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [service, manager, migration, previewRoute, draftPreviewRoute, publishRoute, portalComponent] = await Promise.all([
  read("lib/lms/institutionalAnnouncementService.server.ts"),
  read("components/admin/AnnouncementsManager.tsx"),
  read("supabase/announcement_recipient_resolution.sql"),
  read("app/api/admin/announcements/preview/route.ts"),
  read("app/api/admin/announcements/[id]/preview/route.ts"),
  read("app/api/admin/announcements/[id]/publish/route.ts"),
  read("components/portal/InstitutionalAnnouncements.tsx"),
]);

// Cohort lifecycle is distinct from recipient eligibility.
assert.equal(cohortCanReceiveAnnouncements("planned", "specific"), true);
assert.equal(cohortCanReceiveAnnouncements("upcoming", "current_upcoming"), true);
assert.equal(cohortCanReceiveAnnouncements("admissions_closed", "current_upcoming"), true);
assert.equal(cohortCanReceiveAnnouncements("active", "active"), true);
assert.equal(cohortCanReceiveAnnouncements("planned", "active"), false);
assert.equal(cohortCanReceiveAnnouncements("archived", "specific"), false);
assert.equal(cohortCanReceiveAnnouncements("cancelled", "current_upcoming"), false);

// Provisioned enrolments and application-only admission classes stay explicit.
assert.equal(isCurrentStudentEnrollment("pending_onboarding"), true);
assert.equal(isCurrentStudentEnrollment("active"), true);
assert.equal(isCurrentStudentEnrollment("withdrawn"), false);
assert.equal(applicationMatchesStudentRecipientStatus("admitted", "confirmed_active"), true);
assert.equal(applicationMatchesStudentRecipientStatus("conditional_admission_payment_outstanding", "confirmed_active"), false);
assert.equal(applicationMatchesStudentRecipientStatus("conditional_admission_payment_outstanding", "confirmed_conditional"), true);
for (const excluded of ["pending_review", "waitlisted", "not_admitted", "admission_offer_lapsed_payment_outstanding"]) {
  assert.equal(applicationMatchesStudentRecipientStatus(excluded, "confirmed_conditional"), false);
}

// Delivery counts deduplicate email while portal counts remain account-owned.
const summary = summarizeAnnouncementRecipients([
  { recipientType: "student", studentId: "student-1", registrationId: "registration-1", facilitatorId: null, name: "Student", email: "person@example.com", cohortId: "cohort", recipientClass: "confirmed", portalVisible: true, explicit: false },
  { recipientType: "facilitator", studentId: null, registrationId: null, facilitatorId: "facilitator-1", name: "Facilitator", email: "PERSON@example.com", cohortId: "cohort", recipientClass: "facilitator", portalVisible: true, explicit: false },
  { recipientType: "applicant", studentId: null, registrationId: "registration-2", facilitatorId: null, name: "Conditional", email: "conditional@example.com", cohortId: "cohort", recipientClass: "conditional", portalVisible: false, explicit: false },
]);
assert.deepEqual(summary, { students: { confirmed: 1, conditional: 1, total: 2 }, facilitators: 1, totalUniqueEmailRecipients: 2, portalRecipients: 2, emailOnlyRecipients: 1 });
assert.equal(summarizeAnnouncementRecipients([
  { recipientType: "student", studentId: "student-1", registrationId: null, facilitatorId: null, name: "Student", email: "student@example.com", cohortId: "cohort", recipientClass: "confirmed", portalVisible: true, explicit: false },
], false).portalRecipients, 0);

// Server ownership, assignment resolution, preview parity, and draft semantics.
assert.match(service, /from\("registrations"\)[\s\S]*?\.is\("deleted_at", null\)\.in\("application_status", \["admitted", "conditional_admission_payment_outstanding"\]\)/);
assert.match(service, /facilitator_course_assignments\(cohort_course_id, cohort_courses\(cohort_id, cohorts\(id, status\)\)\)/);
assert.match(service, /from\("class_sessions"\)[\s\S]*?facilitator_id, cohort_courses\(cohort_id, cohorts\(id, status\)\)/);
assert.match(service, /target\.cohortScope !== "specific" \|\| cohortId === target\.cohortId/);
assert.match(service, /const resolved = status === "published" \? await resolvePreview/);
assert.match(service, /requireMatchingPreview\(body, resolved\.previewToken\)/);
assert.match(service, /uuidPattern/);
assert.match(service, /recipientType: "applicant"[\s\S]*?portalVisible: false/);
assert.match(service, /fetchOwnAnnouncements\(supabase, "student_id"/);
assert.doesNotMatch(service, /from\("institutional_announcements"\)\.delete/);

// Stable form reset and failure preservation.
assert.match(manager, /const submittedForm = event\.currentTarget/);
assert.match(manager, /submittedForm\.reset\(\)/);
assert.doesNotMatch(manager, /event\.currentTarget\.reset\(\)/);
assert.match(manager, /if \(!deliveryFailed\)/);
assert.match(manager, /Preview Recipients/);
assert.match(manager, /Confirm Publish/);

// Admin-only previews and a publish-time preview token are required.
assert.match(previewRoute, /isAdminAuthenticated/);
assert.match(draftPreviewRoute, /isAdminAuthenticated/);
assert.match(publishRoute, /request\.json\(\)/);

// Application recipients are schema-owned email snapshots, never portal accounts.
assert.match(migration, /recipient_type in \('student', 'applicant', 'facilitator'\)/);
assert.match(migration, /registration_id uuid references public\.registrations/);
assert.match(migration, /recipient_type = 'applicant'[\s\S]*?not portal_visible/);
assert.match(migration, /Preserve explicit selections from drafts created by the previous version/);
assert.match(migration, /revoke all on public\.institutional_announcements, public\.institutional_announcement_recipients from anon, authenticated/);
assert.doesNotMatch(portalComponent, /registrations|applicant/);

console.log("Announcement recipient resolution checks passed (planned cohorts, learner classes, preview parity, portal separation, safe form reset, and security).");
