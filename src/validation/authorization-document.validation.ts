import { z } from "zod";

const maxBytes = 2 * 1024 * 1024;
const base64Document = z.string().max(Math.ceil(maxBytes / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/);
const pdfSignature = Buffer.from("%PDF-");
const pdfEnd = Buffer.from("%%EOF");
const pngSignature = Buffer.from("89504e470d0a1a0a", "hex");
const pngEnd = Buffer.from("0000000049454e44ae426082", "hex");
const jpegSignature = Buffer.from("ffd8ff", "hex");
const jpegEnd = Buffer.from("ffd9", "hex");

function isPdf(file: Buffer) {
  return file.subarray(0, pdfSignature.length).equals(pdfSignature) && file.subarray(-1024).includes(pdfEnd);
}

function isImage(file: Buffer) {
  return (file.subarray(0, pngSignature.length).equals(pngSignature) && file.subarray(-pngEnd.length).equals(pngEnd)) ||
    (file.subarray(0, jpegSignature.length).equals(jpegSignature) && file.subarray(-jpegEnd.length).equals(jpegEnd));
}

function matchesDocument(value: string, validateFile: (file: Buffer) => boolean) {
  const file = Buffer.from(value, "base64");
  return file.length <= maxBytes && file.toString("base64") === value && validateFile(file);
}

export const authorizationDocument = base64Document.refine(
  (value) => matchesDocument(value, (file) => isPdf(file) || isImage(file)),
  "Informe um termo JPG, PNG ou PDF válido de até 2 MiB em Base64",
);

export const legacyAuthorizationPdf = base64Document.refine(
  (value) => matchesDocument(value, isPdf),
  "Informe um PDF válido de até 2 MiB em Base64",
);
