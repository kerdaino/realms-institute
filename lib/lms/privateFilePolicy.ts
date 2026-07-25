export const privateStorageBuckets = {
  assessment: "assessment-submissions",
  absence: "absence-evidence",
  award: "institutional-awards",
  learningResource: "learning-resources",
} as const;

export const privateFileLimits = {
  assessmentAttachment: 15 * 1024 * 1024,
  assessmentProjectArchive: 50 * 1024 * 1024,
  absenceEvidence: 10 * 1024 * 1024,
  certificatePdf: 10 * 1024 * 1024,
  // Vercel Functions currently cap request payloads at 4.5 MB. Keeping the
  // file itself at 4 MB leaves room for multipart fields and headers.
  learningResource: 4 * 1024 * 1024,
} as const;

export const privateFileSignedUrlSeconds = 5 * 60;

export const assessmentFileAccept = ".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp,.zip";
export const absenceFileAccept = ".pdf,.jpg,.jpeg,.png,.webp";
export const learningResourceFileAccept = ".pdf,.docx,.pptx,.xlsx,.txt,.jpg,.jpeg,.png,.webp";

const dangerousExtensions = new Set(["exe", "dmg", "pkg", "bat", "cmd", "scr", "com", "msi", "app", "jar", "ps1", "sh"]);

export function safeDisplayFilename(value: string) {
  const basename = value.replaceAll("\\", "/").split("/").at(-1) || "file";
  const cleaned = basename.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[^A-Za-z0-9._()\- ]/g, "-").replace(/\s+/g, " ").replace(/^\.+/, "").trim();
  return (cleaned || "file").slice(0, 180);
}

export function fileExtension(filename: string) {
  const safe = safeDisplayFilename(filename);
  const index = safe.lastIndexOf(".");
  return index > 0 ? safe.slice(index + 1).toLowerCase() : "";
}

export function isDangerousFileExtension(filename: string) {
  return dangerousExtensions.has(fileExtension(filename));
}

function hasPrefix(bytes: Uint8Array, prefix: number[]) { return prefix.every((value, index) => bytes[index] === value); }
function containsAscii(bytes: Uint8Array, token: string) {
  const expected = new TextEncoder().encode(token);
  outer: for (let start = 0; start <= bytes.length - expected.length; start += 1) {
    for (let offset = 0; offset < expected.length; offset += 1) if (bytes[start + offset] !== expected[offset]) continue outer;
    return true;
  }
  return false;
}

export function privateFileContentMatches(extension: string, bytes: Uint8Array) {
  if (extension === "pdf") return hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (extension === "docx") return (hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]) || hasPrefix(bytes, [0x50, 0x4b, 0x05, 0x06])) && containsAscii(bytes, "[Content_Types].xml") && containsAscii(bytes, "word/");
  if (extension === "pptx") return (hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]) || hasPrefix(bytes, [0x50, 0x4b, 0x05, 0x06])) && containsAscii(bytes, "[Content_Types].xml") && containsAscii(bytes, "ppt/");
  if (extension === "xlsx") return (hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]) || hasPrefix(bytes, [0x50, 0x4b, 0x05, 0x06])) && containsAscii(bytes, "[Content_Types].xml") && containsAscii(bytes, "xl/");
  if (extension === "zip") return hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]) || hasPrefix(bytes, [0x50, 0x4b, 0x05, 0x06]);
  if (["jpg", "jpeg"].includes(extension)) return hasPrefix(bytes, [0xff, 0xd8, 0xff]);
  if (extension === "png") return hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (extension === "webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (extension === "txt") return !bytes.slice(0, 4096).includes(0);
  return false;
}

export function assessmentUploadLimit(assignmentType: string, assessmentCategory: string) {
  return assignmentType === "capstone" || assignmentType === "project" || assessmentCategory === "capstone"
    ? privateFileLimits.assessmentProjectArchive
    : privateFileLimits.assessmentAttachment;
}
