import { z } from "zod";
import { profilePhotoUploadSchema } from "./profile-photo.validation";

export const profileUpdateSchema = z.object({
  cep: z.string().trim().regex(/^\d{5}-?\d{3}$/, "CEP inválido").transform((value) => value.replace("-", "")).optional(),
  address: z.string().trim().min(1, "Informe o endereço").max(255, "O endereço deve ter no máximo 255 caracteres").optional(),
  addressNumber: z.string().trim().min(1).max(30, "O número deve ter no máximo 30 caracteres").nullable().optional(),
  profilePhoto: profilePhotoUploadSchema.optional(),
}).strict().refine(
  ({ cep, address, addressNumber, profilePhoto }) =>
    cep !== undefined || address !== undefined || addressNumber !== undefined || profilePhoto !== undefined,
  "Informe pelo menos um campo do perfil",
);
