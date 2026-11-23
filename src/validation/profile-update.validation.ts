import { z } from "zod";

const maxPhotoBytes = 512 * 1024;
const photoPattern = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

function isProfilePhoto(value: string) {
  const match = photoPattern.exec(value);
  if (!match) return false;
  const [, type, data] = match;
  const photo = Buffer.from(data, "base64");
  if (photo.length > maxPhotoBytes || photo.toString("base64") !== data) return false;
  if (type === "jpeg") return photo.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"));
  if (type === "png") return photo.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  return photo.subarray(0, 4).toString() === "RIFF" && photo.subarray(8, 12).toString() === "WEBP";
}

export const profileUpdateSchema = z.object({
  jobTitle: z.string().trim().max(100, "A função deve ter no máximo 100 caracteres").optional(),
  profilePhoto: z.string().max(700_000).refine(isProfilePhoto, "Envie uma imagem JPG, PNG ou WebP válida de até 512 KiB").optional(),
}).strict().refine(({ jobTitle, profilePhoto }) => jobTitle !== undefined || profilePhoto !== undefined, "Informe a função ou a foto");
