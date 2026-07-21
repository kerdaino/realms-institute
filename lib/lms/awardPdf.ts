import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

export type CertificateSignature = { name: string; role: string; imageBytes: Uint8Array };
export type CertificatePdfInput = {
  awardTitle: string;
  recipientLegalName: string;
  claimText: string;
  programmeName: string;
  cohortName: string;
  discipleshipRoute: string;
  skillPathway: string;
  issueDate: string;
  awardNumber: string;
  verificationUrl: string;
  verificationFooter: string;
  logoBytes: Uint8Array;
  backgroundBytes?: Uint8Array | null;
  signatures: CertificateSignature[];
  draftPreview?: boolean;
};

const navy = rgb(7 / 255, 19 / 255, 39 / 255);
const gold = rgb(215 / 255, 170 / 255, 69 / 255);
const cream = rgb(250 / 255, 247 / 255, 238 / 255);
const slate = rgb(67 / 255, 82 / 255, 103 / 255);

function titleCase(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function centered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = navy) { page.drawText(text, { x: (page.getWidth() - font.widthOfTextAtSize(text, size)) / 2, y, font, size, color }); }
function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/); const lines: string[] = []; let line = "";
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next; else { if (line) lines.push(line); line = word; } }
  if (line) lines.push(line); return lines;
}
async function embedImage(document: PDFDocument, bytes: Uint8Array): Promise<PDFImage> { try { return await document.embedPng(bytes); } catch { return document.embedJpg(bytes); } }

export async function renderInstitutionalCertificatePdf(input: CertificatePdfInput) {
  const document = await PDFDocument.create();
  document.setTitle(`${input.awardTitle} - ${input.recipientLegalName}`);
  document.setAuthor("REALMS Institute");
  document.setSubject("REALMS institutional certificate verification document");
  document.setProducer("REALMS Institute LMS");
  const page = document.addPage([841.89, 595.28]);
  const width = page.getWidth(); const height = page.getHeight();
  page.drawRectangle({ x: 0, y: 0, width, height, color: cream });
  if (input.backgroundBytes) { const background = await embedImage(document, input.backgroundBytes); page.drawImage(background, { x: 0, y: 0, width, height, opacity: 0.2 }); }
  page.drawRectangle({ x: 18, y: 18, width: width - 36, height: height - 36, borderColor: navy, borderWidth: 2 });
  page.drawRectangle({ x: 25, y: 25, width: width - 50, height: height - 50, borderColor: gold, borderWidth: 1 });
  page.drawRectangle({ x: 26, y: height - 132, width: width - 52, height: 105, color: navy });
  const sans = await document.embedFont(StandardFonts.Helvetica); const sansBold = await document.embedFont(StandardFonts.HelveticaBold); const serif = await document.embedFont(StandardFonts.TimesRoman); const serifBold = await document.embedFont(StandardFonts.TimesRomanBold);
  const logo = await embedImage(document, input.logoBytes); const logoScale = Math.min(64 / logo.width, 64 / logo.height); const logoWidth = logo.width * logoScale; const logoHeight = logo.height * logoScale;
  page.drawImage(logo, { x: 52, y: height - 111, width: logoWidth, height: logoHeight });
  page.drawText("REALMS INSTITUTE", { x: 135, y: height - 72, font: sansBold, size: 21, color: cream });
  page.drawText("REALMS SCHOOL OF DISCOVERY", { x: 135, y: height - 96, font: sans, size: 11, color: gold });
  if (input.draftPreview) page.drawText("DRAFT PREVIEW - NOT VALID", { x: width - 242, y: height - 82, font: sansBold, size: 12, color: gold });
  centered(page, input.awardTitle.toUpperCase(), height - 173, sansBold, 15, slate);
  centered(page, "This certifies that", height - 207, serif, 13, slate);
  const nameSize = input.recipientLegalName.length > 36 ? 27 : 33;
  centered(page, input.recipientLegalName, height - 250, serifBold, nameSize, navy);
  page.drawLine({ start: { x: 165, y: height - 260 }, end: { x: width - 165, y: height - 260 }, color: gold, thickness: 1.2 });
  const claimLines = wrap(input.claimText, serif, 13, 650).slice(0, 4);
  claimLines.forEach((line, index) => centered(page, line, height - 292 - index * 18, serif, 13, slate));
  const detailsY = height - 378;
  const detailRows = [["Programme", input.programmeName], ["Cohort", input.cohortName], ["Discipleship Route", titleCase(input.discipleshipRoute)], ["Skill Pathway", titleCase(input.skillPathway)]];
  detailRows.forEach(([label, value], index) => { const col = index % 2; const row = Math.floor(index / 2); const x = 82 + col * 330; const y = detailsY - row * 34; page.drawText(`${label}:`, { x, y, font: sansBold, size: 9, color: slate }); page.drawText(value, { x: x + 105, y, font: sans, size: 9.5, color: navy }); });
  const signatureY = 92;
  if (input.signatures.length) {
    const space = 390 / input.signatures.length;
    for (let index = 0; index < input.signatures.length; index += 1) { const signature = input.signatures[index]; const x = 80 + index * space; const image = await embedImage(document, signature.imageBytes); const scale = Math.min(110 / image.width, 38 / image.height); page.drawImage(image, { x, y: signatureY + 29, width: image.width * scale, height: image.height * scale }); page.drawLine({ start: { x, y: signatureY + 25 }, end: { x: x + 135, y: signatureY + 25 }, color: slate, thickness: 0.6 }); page.drawText(signature.name, { x, y: signatureY + 10, font: sansBold, size: 8.5, color: navy }); page.drawText(signature.role, { x, y: signatureY - 2, font: sans, size: 7.5, color: slate }); }
  } else if (input.draftPreview) page.drawText("Approved signatory configuration required before issuance", { x: 80, y: signatureY + 20, font: sansBold, size: 9, color: slate });
  const qrData = await QRCode.toDataURL(input.verificationUrl, { errorCorrectionLevel: "M", margin: 1, width: 180, color: { dark: "#071327", light: "#FFFFFF" } });
  const qr = await document.embedPng(Uint8Array.from(Buffer.from(qrData.split(",")[1], "base64")));
  page.drawImage(qr, { x: width - 164, y: 75, width: 76, height: 76 });
  page.drawText("VERIFY THIS AWARD", { x: width - 174, y: 60, font: sansBold, size: 7.5, color: navy });
  page.drawText(`Award No: ${input.awardNumber}`, { x: width - 305, y: 48, font: sans, size: 8, color: slate });
  page.drawText(`Issue date: ${input.issueDate}`, { x: 80, y: 48, font: sans, size: 8, color: slate });
  const footer = wrap(input.verificationFooter, sans, 7.4, 680).slice(0, 2); footer.forEach((line, index) => centered(page, line, 31 - index * 9, sans, 7.4, slate));
  return document.save();
}
