import { Request, Response } from "express";
import { AccountError, deleteAccount, exportAccountJson, exportAccountPdf } from "@/services/Main/account/account.service";
import { StoreError } from "@/services/Main/store/exceptions/StoreError";
import { z } from "zod";
import { listSessionHistory } from "@/services/Auth/session/session.service";
import { Role } from "@prisma/client";
import { getAccountProfile, updateAccountProfile, updateAccountTwoFactor } from "@/services/Main/account/profile.service";
import { profileUpdateSchema } from "@/validation/profile-update.validation";
import { loginSchema } from "@/validation/login.validation";

function handleError(res: Response, error: unknown) {
  if (error instanceof AccountError || error instanceof StoreError) return res.status(error.status).json({ message: error.message });
  console.error(error);
  return res.status(500).json({ message: "Erro interno ao processar a conta" });
}

const historyQuery = z.object({
  page: z.coerce.number().int().min(1).max(20_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
}).strict();

export async function listSessionHistoryController(req: Request, res: Response) {
  const query = historyQuery.safeParse(req.query);
  if (!query.success) return res.status(400).json({ message: "Paginação inválida", errors: query.error.flatten().fieldErrors });

  try {
    const { id, sessionId } = req.user!;
    const { page, limit } = query.data;
    res.setHeader("Cache-Control", "no-store");
    return res.json(await listSessionHistory(id, sessionId, page, limit));
  } catch (error) {
    return handleError(res, error);
  }
}

export async function deleteAccountController(req: Request, res: Response) {
  try {
    const role = await deleteAccount(req.user!.id, req.body.password);
    if (role === Role.MASTER) res.once("finish", () => req.app.emit("masterDeleted"));
    return res.status(204).send();
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getAccountProfileController(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  try {
    return res.json(await getAccountProfile(req.user!.id));
  } catch (error) { return handleError(res, error); }
}

export async function updateAccountProfileController(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Dados do perfil inválidos", errors: parsed.error.flatten().fieldErrors });
  try {
    return res.json(await updateAccountProfile(req.user!.id, parsed.data));
  } catch (error) { return handleError(res, error); }
}

const twoFactorSettings = z.object({ enabled: z.boolean(), password: loginSchema.shape.password }).strict();

export async function updateAccountTwoFactorController(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const parsed = twoFactorSettings.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Informe o estado do 2FA e a senha atual" });
  try {
    return res.json(await updateAccountTwoFactor(req.user!.id, parsed.data));
  } catch (error) { return handleError(res, error); }
}

export async function exportAccountController(req: Request, res: Response) {
  try {
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Cache-Control", "no-store");
    if (req.query.format === "json") {
      const data = await exportAccountJson(req.user!.id);
      res.attachment("meus-dados-" + date + ".json");
      return res.json(data);
    }
    const pdf = await exportAccountPdf(req.user!.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="meus-dados-${date}.pdf"`);
    res.setHeader("Content-Length", pdf.length.toString());
    return res.status(200).send(pdf);
  } catch (error) {
    return handleError(res, error);
  }
}
