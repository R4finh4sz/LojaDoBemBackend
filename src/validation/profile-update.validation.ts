import { z } from "zod";

export const profileUpdateSchema = z.object({
  cep: z.string().trim().regex(/^\d{5}-?\d{3}$/, "CEP inválido").transform((value) => value.replace("-", "")).optional(),
  address: z.string().trim().min(1, "Informe o endereço").max(255, "O endereço deve ter no máximo 255 caracteres").optional(),
  addressNumber: z.string().trim().min(1).max(30, "O número deve ter no máximo 30 caracteres").nullable().optional(),
}).strict().refine(
  ({ cep, address, addressNumber }) => cep !== undefined || address !== undefined || addressNumber !== undefined,
  "Informe pelo menos um campo de endereço",
);
