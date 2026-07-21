import { mkdir, readFile, writeFile } from "node:fs/promises";

import { renderInstitutionalCertificatePdf } from "../lib/lms/awardPdf.ts";

const output = new URL("../output/pdf/build-12-certificate-draft-preview.pdf", import.meta.url);
await mkdir(new URL("../output/pdf/", import.meta.url), { recursive: true });
const logoBytes = new Uint8Array(await readFile(new URL("../public/images/realms-logo.png", import.meta.url)));
const bytes = await renderInstitutionalCertificatePdf({
  awardTitle: "REALMS Institutional Certificate of Completion and Competence",
  recipientLegalName: "Preview Recipient",
  claimText: "This certifies that Preview Recipient successfully completed the REALMS School of Discovery, comprising the approved Foundational Discipleship Route and Web Development Skill Pathway, having satisfied the published programme requirements of REALMS Institute.",
  programmeName: "REALMS School of Discovery",
  cohortName: "August 2026 Cohort",
  discipleshipRoute: "foundational",
  skillPathway: "web_development",
  issueDate: "2026-08-30",
  awardNumber: "DRAFT-PREVIEW-NOT-VALID",
  verificationUrl: "https://example.invalid/verify-certificate/draft-preview",
  verificationFooter: "This is a REALMS institutional certificate. It must not be represented as a degree, national diploma, government accreditation or professional licence.",
  logoBytes,
  signatures: [],
  draftPreview: true,
});
await writeFile(output, bytes);
console.log(output.pathname);
