import { Request, Response } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { UserAlreadyExistsError } from "@/services/Auth/register/register.service";
import { sendOperatorInvitation } from "@/services/Auth/register/operator-invitation.service";
import { EmailConfigurationError, EmailDeliveryError } from "@/services/Auth/email/email.service";
import { CurrentTermNotFoundError } from "@/services/Main/terms/terms.service";
import { registerOperatorSchema } from "@/validation/register.validation";
import { cnpjSchema } from "@/validation/cnpj.validation";
import { resolveMunicipality, sameLocation } from "@/services/Main/residents/municipality";
import { StoreError } from "@/services/Main/store/exceptions/StoreError";

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
    const location = await resolveMunicipality(parsed.data.cep);
    if (!sameLocation(parsed.data, location)) throw new StoreError("Cidade e UF devem corresponder ao CEP do operador", 400);
    const result = await sendOperatorInvitation({ ...parsed.data, ...location }, role, cnpj);
    return res.status(202).json(result);
  } catch (err) {
    if (err instanceof CurrentTermNotFoundError) return res.status(409).json({ message: "Publique um termo administrativo antes de enviar o convite" });
    if (err instanceof EmailConfigurationError || err instanceof EmailDeliveryError) {
      return res.status(502).json({ message: "Não foi possível enviar o convite por e-mail" });
    }
    if (err instanceof z.ZodError) return res.status(400).json({ message: "CNPJ inválido" });
    if (err instanceof StoreError) return res.status(err.status).json({ message: err.message });
    if (err instanceof UserAlreadyExistsError) {
      return res.status(409).json({ message: "Não foi possível concluir o cadastro com os dados informados" });
    }

    console.error(err);
    return res.status(500).json({ message: "Erro interno ao cadastrar administrador" });
  }
};
