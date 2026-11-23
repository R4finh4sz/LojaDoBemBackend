import { Request, Response } from "express";
import { registerUser } from "@/services/Auth/register/register-user.service";
import { UserAlreadyExistsError } from "@/services/Auth/register/register.service";
import { registerSchema } from "@/validation/register.validation";
import { resolveMunicipality, sameLocation } from "@/services/Main/residents/municipality";
import { StoreError } from "@/services/Main/store/exceptions/StoreError";

export async function registerUserController(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Dados inválidos",
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const location = await resolveMunicipality(parsed.data.cep);
    if (!sameLocation(parsed.data, location)) throw new StoreError("Cidade e UF devem corresponder ao CEP", 400);
    const result = await registerUser({ ...parsed.data, ...location });
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof StoreError) return res.status(err.status).json({ message: err.message });
    if (err instanceof UserAlreadyExistsError) {
      return res.status(409).json({ message: "Não foi possível concluir o cadastro com os dados informados" });
    }

    console.error(err);
    return res.status(500).json({ message: "Erro interno ao cadastrar usuário" });
  }
}
