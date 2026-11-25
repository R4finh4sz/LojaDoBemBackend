import { Request, Response } from "express";
import {
  InvalidTwoFactorCodeError,
  TwoFactorChallengeBlockedError,
  TwoFactorChallengeExpiredError,
  TwoFactorChallengeNotFoundError,
  TwoFactorInactiveUserError,
  verifyTwoFactor,
} from "@/services/Auth/two-factor/two-factor.service";
import { verifyTwoFactorSchema } from "@/validation/login.validation";
import { sessionMetadata } from "@/services/Auth/session/session-metadata";
import { recordAuthenticationEvent } from "@/services/Auth/authentication-audit.service";

export async function verifyTwoFactorController(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const parsed = verifyTwoFactorSchema.safeParse(req.body);
  if (!parsed.success) {
    await recordAuthenticationEvent(req, "TWO_FACTOR_FAILURE");
    return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.flatten().fieldErrors });
  }

  try {
    const result = await verifyTwoFactor(parsed.data, sessionMetadata(req));
    await recordAuthenticationEvent(req, "TWO_FACTOR_SUCCESS");
    return res.status(200).json(result);
  } catch (err) {
    await recordAuthenticationEvent(req, "TWO_FACTOR_FAILURE");
    if (err instanceof InvalidTwoFactorCodeError) return res.status(401).json({ message: err.message });
    if (err instanceof TwoFactorChallengeNotFoundError) return res.status(404).json({ message: err.message });
    if (err instanceof TwoFactorChallengeExpiredError || err instanceof TwoFactorInactiveUserError) {
      return res.status(403).json({ message: err.message });
    }
    if (err instanceof TwoFactorChallengeBlockedError) return res.status(429).json({ message: err.message });
    console.error(err);
    return res.status(500).json({ message: "Erro interno ao validar 2FA" });
  }
}
