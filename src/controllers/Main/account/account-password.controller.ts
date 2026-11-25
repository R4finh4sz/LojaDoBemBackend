import { Request, Response } from "express";
import { EmailConfigurationError, EmailDeliveryError } from "@/services/Auth/email/email.service";
import {
  InvalidPasswordResetCodeError, InvalidPasswordResetTokenError, PasswordChangeUnavailableError,
  PasswordResetBlockedError, PasswordResetChallengeNotFoundError, PasswordResetCodeExpiredError,
  requestAccountPasswordChange, resetPassword, verifyPasswordResetCode,
} from "@/services/Auth/forgot-password/forgot-password.service";
import { resetPasswordSchema, verifyPasswordResetCodeSchema } from "@/validation/password-reset.validation";

const accountPasswordSchema = resetPasswordSchema.refine(({ password }) => Buffer.byteLength(password, "utf8") <= 72, {
  path: ["password"], message: "A senha pode ter no máximo 72 bytes",
});

function session(req: Request) {
  return { userId: req.user!.id, sessionId: req.user!.sessionId };
}

function handleError(res: Response, error: unknown) {
  if (error instanceof PasswordChangeUnavailableError) return res.status(403).json({ message: error.message });
  if (error instanceof PasswordResetBlockedError) return res.status(429).json({ message: error.message });
  if (error instanceof EmailConfigurationError || error instanceof EmailDeliveryError) {
    return res.status(502).json({ message: "Não foi possível enviar o código. Tente novamente." });
  }
  if (error instanceof InvalidPasswordResetCodeError || error instanceof PasswordResetChallengeNotFoundError || error instanceof PasswordResetCodeExpiredError) {
    return res.status(400).json({ message: "Código inválido ou expirado" });
  }
  if (error instanceof InvalidPasswordResetTokenError) return res.status(400).json({ message: error.message });
  console.error("Falha na alteração de senha da conta", error instanceof Error ? error.name : "Erro desconhecido");
  return res.status(500).json({ message: "Não foi possível alterar a senha" });
}

export async function requestAccountPasswordCode(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  try {
    return res.json(await requestAccountPasswordChange(session(req)));
  } catch (error) { return handleError(res, error); }
}

export async function verifyAccountPasswordCode(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const parsed = verifyPasswordResetCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  try {
    return res.json(await verifyPasswordResetCode(parsed.data, session(req)));
  } catch (error) { return handleError(res, error); }
}

export async function changeAccountPassword(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const parsed = accountPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  try {
    await resetPassword(parsed.data, session(req));
    return res.status(204).end();
  } catch (error) { return handleError(res, error); }
}
