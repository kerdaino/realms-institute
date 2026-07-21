export type StudentHandbookDocument = {
  documentType: "student_handbook";
  version: string;
  title: string;
  school: string;
  cohortLabel: string;
  acknowledgementText: string;
  fileHref: string;
};

export const studentHandbookDocuments: readonly StudentHandbookDocument[] = [
  {
    documentType: "student_handbook",
    version: "1.0",
    title: "REALMS School of Discovery August 2026 Student Handbook",
    school: "REALMS School of Discovery",
    cohortLabel: "August 2026",
    acknowledgementText: "I confirm that I have read and understood the REALMS School of Discovery August 2026 Student Handbook and agree to follow the published programme requirements applicable to my approved route and pathway.",
    fileHref: "/handbooks/REALMS_School_of_Discovery_August_2026_Student_Handbook_v1.0.pdf",
  },
] as const;

export const requiredStudentHandbookVersionByCohortCode: Readonly<Record<string, string>> = {
  "RSD-AUG-2026": "1.0",
};

export function resolveRequiredStudentHandbook(
  cohortCode: string | null | undefined,
  documents: readonly StudentHandbookDocument[] = studentHandbookDocuments,
  requiredVersions: Readonly<Record<string, string>> = requiredStudentHandbookVersionByCohortCode,
) {
  if (!cohortCode) return null;
  const requiredVersion = requiredVersions[cohortCode];
  if (!requiredVersion) return null;
  return documents.find((document) => document.documentType === "student_handbook" && document.version === requiredVersion) ?? null;
}
