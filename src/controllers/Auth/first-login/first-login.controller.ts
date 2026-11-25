import { Request, Response } from "express";
import { z } from "zod";
import { completeFirstLogin, FirstLoginError, getFirstLoginTerm } from "@/services/Auth/first-login/first-login.service";
import { sessionMetadata } from "@/services/Auth/session/session-metadata";
import { CurrentTermNotFoundError } from "@/services/Main/terms/terms.service";
import { passwordSchema } from "@/validation/password-reset.validation";

const setupInput = z.object({
  password: passwordSchema.refine((password) => Buffer.byteLength(password, "utf8") <= 72, "A senha deve ter no máximo 72 bytes"),
  passwordConfirmation: passwordSchema,
  termDocumentId: z.string().uuid(),
  termsAccepted: z.literal(true),
}).strict().refine(({ password, passwordConfirmation }) => password === passwordConfirmation, {
  path: ["passwordConfirmation"], message: "As senhas não coincidem",
});

function firstLoginToken(req: Request) {
  return req.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
}

function handleError(res: Response, error: unknown) {
  if (error instanceof FirstLoginError) return res.status(error.status).json({ message: error.message });
  if (error instanceof CurrentTermNotFoundError) return res.status(409).json({ message: "Nenhum termo vigente para operadores" });
  console.error(error);
  return res.status(500).json({ message: "Erro interno no primeiro acesso" });
}

export async function firstLoginTermController(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  try {
    return res.json(await getFirstLoginTerm(firstLoginToken(req)));
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeFirstLoginController(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const parsed = setupInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.flatten().fieldErrors });
  try {
    return res.json(await completeFirstLogin(firstLoginToken(req), parsed.data, sessionMetadata(req)));
  } catch (error) {
    return handleError(res, error);
  }
}
