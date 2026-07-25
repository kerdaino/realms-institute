export const learningResourceTypeOptions = [
  { value: "document", label: "Reading" },
  { value: "slides", label: "Slides" },
  { value: "download", label: "Handout" },
  { value: "scripture_reference", label: "Reference" },
  { value: "worksheet", label: "Worksheet" },
  { value: "other", label: "Other" },
] as const;

export const learningResourceTypes = learningResourceTypeOptions.map((option) => option.value);

export function learningResourceTypeLabel(value: string) {
  return learningResourceTypeOptions.find((option) => option.value === value)?.label
    ?? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function isLearningResourceType(value: unknown): value is (typeof learningResourceTypes)[number] {
  return typeof value === "string" && (learningResourceTypes as readonly string[]).includes(value);
}

export function fileTypeLabel(filename: string | null) {
  if (!filename) return null;
  const extension = filename.split(".").at(-1)?.trim().toUpperCase();
  return extension && extension.length <= 5 ? extension : null;
}
