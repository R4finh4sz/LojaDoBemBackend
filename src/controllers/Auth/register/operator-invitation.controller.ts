import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  acceptOperatorInvitation,
  operatorInvitationPath,
  readOperatorInvitation,
} from "@/services/Auth/register/operator-invitation.service";
import { UserAlreadyExistsError } from "@/services/Auth/register/register.service";
import { CurrentTermNotFoundError, getCurrentTermByRole } from "@/services/Main/terms/terms.service";
import { StoreError } from "@/services/Main/store/exceptions/StoreError";
import { operatorInvitationPasswordSchema } from "@/validation/register.validation";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function page(res: Response, status: number, title: string, content: string) {
  return res.status(status)
    .set({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    })
    .type("html")
    .send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font:1rem/1.5 system-ui,sans-serif;color:#172c23;max-width:42rem;margin:3rem auto;padding:0 1rem}label{display:block;margin:1rem 0}input,button{font:inherit}input[type=password]{display:block;box-sizing:border-box;width:100%;padding:.4rem}button{padding:.5rem 1rem}article{white-space:pre-wrap;overflow-wrap:anywhere}</style><main><h1>${escapeHtml(title)}</h1>${content}</main></html>`);
}

async function showForm(res: Response, token: string, error?: string) {
  const invitation = readOperatorInvitation(token);
  const term = await getCurrentTermByRole(invitation.role);
  return page(res, error ? 400 : 200, "Ative sua conta ReciclaOnline", `
    <h2>${escapeHtml(term.title || "Termos de uso")} · Versão ${term.version}</h2>
    <article>${escapeHtml(term.text)}</article>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ""}
    <form method="post" action="${operatorInvitationPath}">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <input type="hidden" name="documentId" value="${escapeHtml(term.documentId)}">
      <label><input type="checkbox" name="accepted" value="yes" required> Li e aceito os termos de uso</label>
      <label>Senha <input type="password" name="password" minlength="8" maxlength="72" autocomplete="new-password" required></label>
      <label>Confirme a senha <input type="password" name="passwordConfirmation" minlength="8" maxlength="72" autocomplete="new-password" required></label>
      <button type="submit">Aceitar termos e criar conta</button>
    </form>`);
}

function handleError(res: Response, error: unknown) {
  if (error instanceof StoreError) return page(res, error.status, "Convite de cadastro", `<p>${escapeHtml(error.message)}</p>`);
  if (error instanceof UserAlreadyExistsError) return page(res, 409, "Conta já cadastrada", "<p>Use seu e-mail para entrar ou recuperar sua senha.</p>");
  if (error instanceof CurrentTermNotFoundError) return page(res, 409, "Termos indisponíveis", "<p>Entre em contato com a administração para concluir o cadastro.</p>");
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    return page(res, 409, "Tente novamente", "<p>Abra o convite novamente para concluir o cadastro.</p>");
  }
  console.error("Falha na ativação de operador", error instanceof Error ? error.name : "Erro desconhecido");
  return page(res, 500, "Falha na ativação", "<p>Tente novamente mais tarde.</p>");
}

export async function getOperatorInvitation(req: Request, res: Response) {
  try {
    if (typeof req.query.token !== "string") throw new StoreError("Convite inválido ou expirado", 400);
    return await showForm(res, req.query.token);
  } catch (error) {
    return handleError(res, error);
  }
}

const acceptanceSchema = z.object({ documentId: z.string().uuid(), accepted: z.literal("yes") });

export async function postOperatorInvitation(req: Request, res: Response) {
  try {
    const invitation = readOperatorInvitation(req.body?.token);
    const acceptance = acceptanceSchema.safeParse(req.body);
    const password = operatorInvitationPasswordSchema.safeParse(req.body);
    if (!acceptance.success) return await showForm(res, req.body.token, "Leia e aceite os termos para continuar.");
    if (!password.success) return await showForm(res, req.body.token, password.error.issues[0].message);
    await acceptOperatorInvitation(invitation, acceptance.data.documentId, password.data.password);
    return page(res, 201, "Conta criada", "<p>Volte ao ReciclaOnline e entre com seu e-mail e a senha que você definiu.</p>");
  } catch (error) {
    return handleError(res, error);
  }
}
