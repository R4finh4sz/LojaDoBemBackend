import { Request, Response } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { createUserWithRole, UserAlreadyExistsError } from "@/services/Auth/register/register.service";
import { registerOperatorSchema } from "@/validation/register.validation";
import { StoreError } from "@/services/Main/store/exceptions/StoreError";

import { cnpjSchema } from "@/validation/cnpj.validation";

export const registerOperatorController = (role: typeof Role.PrefeituraVendedor | typeof Role.COOPERATIVA) => async (req: Request, res: Response) => {
  const parsed = registerOperatorSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Dados inválidos",
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const cnpj = role === Role.PrefeituraVendedor ? cnpjSchema.parse(req.body.cnpj) : undefined;
    const result = await createUserWithRole(parsed.data, { role, cnpj });
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
