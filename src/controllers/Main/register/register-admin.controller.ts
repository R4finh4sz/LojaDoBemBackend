import { Request, Response } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { createUserWithRole, UserAlreadyExistsError } from "@/services/Auth/register/register.service";
import { registerSchema } from "@/validation/register.validation";
import { resolveMunicipality, sameLocation } from "@/services/Main/residents/municipality";
import { StoreError } from "@/services/Main/store/exceptions/StoreError";

const cnpjSchema = z.string().transform((value) => value.replace(/[^a-z0-9]/gi, "").toUpperCase()).refine((value) => {
  if (!/^[A-Z0-9]{12}\d{2}$/.test(value) || /^(\d)\1{13}$/.test(value)) return false;
  const digit = (base: string, weights: number[]) => {
    const remainder = weights.reduce((sum, weight, index) => sum + (base.charCodeAt(index) - 48) * weight, 0) % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return digit(value, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(value[12]) &&
    digit(value, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(value[13]);
});

export const registerOperatorController = (role: typeof Role.PrefeituraVendedor | typeof Role.COOPERATIVA) => async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Dados inválidos",
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const cnpj = role === Role.PrefeituraVendedor ? cnpjSchema.parse(req.body.cnpj) : undefined;
    const location = await resolveMunicipality(parsed.data.cep);
    if (!sameLocation(parsed.data, location)) throw new StoreError("Cidade e UF devem corresponder ao CEP do operador", 400);
    const result = await createUserWithRole({ ...parsed.data, ...location }, role, cnpj);
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: "CNPJ inválido" });
    if (err instanceof StoreError) return res.status(err.status).json({ message: err.message });
    if (err instanceof UserAlreadyExistsError) {
      return res.status(409).json({ message: "Não foi possível concluir o cadastro com os dados informados" });
    }

    console.error(err);
    return res.status(500).json({ message: "Erro interno ao cadastrar administrador" });
  }
};
