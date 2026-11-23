import { Request, Response } from "express";
import { AccountError, deleteAccount, exportAccountPdf } from "@/services/Main/account/account.service";
import { StoreError } from "@/services/Main/store/exceptions/StoreError";
import { z } from "zod";
import { listSessionHistory } from "@/services/Auth/session/session.service";

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
    await deleteAccount(req.user!.id, req.body.password);
    return res.status(204).send();
  } catch (error) {
    return handleError(res, error);
  }
}

export async function exportAccountController(req: Request, res: Response) {
  try {
    const pdf = await exportAccountPdf(req.user!.id);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="meus-dados-${date}.pdf"`);
    res.setHeader("Content-Length", pdf.length.toString());
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(pdf);
  } catch (error) {
    return handleError(res, error);
  }
}
