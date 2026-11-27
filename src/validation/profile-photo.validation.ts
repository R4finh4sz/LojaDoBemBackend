import { z } from "zod";

export const profilePhotoDataUrl = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i;

export const profilePhotoUploadSchema = z.string()
  .max(900_000, "A foto de perfil é muito grande")
  .regex(profilePhotoDataUrl, "Envie uma foto JPG, PNG ou WebP válida");
