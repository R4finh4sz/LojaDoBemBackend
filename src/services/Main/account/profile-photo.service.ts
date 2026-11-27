import sharp from "sharp";
import { profilePhotoDataUrl, profilePhotoUploadSchema } from "@/validation/profile-photo.validation";
import { StoreError } from "@/services/Main/store/exceptions/StoreError";

const pngSignature = Buffer.from("89504e470d0a1a0a", "hex");
const pngEnd = Buffer.from("0000000049454e44ae426082", "hex");
const maxImagePixels = 4_194_304;

function matchesImageContainer(format: string, bytes: Buffer) {
  switch (format) {
    case "jpeg":
      return bytes.length >= 5 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
        bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
    case "png":
      return bytes.subarray(0, 8).equals(pngSignature) && bytes.subarray(-12).equals(pngEnd);
    case "webp":
      return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP" && bytes.readUInt32LE(4) === bytes.length - 8;
    default:
      return false;
  }
}

export async function sanitizeProfilePhoto(value: string) {
  const upload = profilePhotoUploadSchema.safeParse(value);
  if (!upload.success) throw new StoreError(upload.error.issues[0].message, 400);

  const [, declaredFormat, encoded] = profilePhotoDataUrl.exec(upload.data)!;
  const format = declaredFormat.toLowerCase();
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded || !matchesImageContainer(format, bytes)) {
    throw new StoreError("O conteúdo da foto não corresponde a uma imagem válida", 400);
  }

  try {
    const image = sharp(bytes, { failOn: "warning", limitInputPixels: maxImagePixels });
    const metadata = await image.metadata();
    if (metadata.format !== format || (metadata.pages ?? 1) !== 1) {
      throw new Error("Formato incompatível");
    }
    // Encode from decoded pixels, dropping the source container and metadata.
    const clean = await image.autoOrient().webp({ quality: 90 }).toBuffer();
    return `data:image/webp;base64,${clean.toString("base64")}`;
  } catch {
    throw new StoreError("Foto inválida, corrompida ou acima do limite de dimensões", 400);
  }
}
