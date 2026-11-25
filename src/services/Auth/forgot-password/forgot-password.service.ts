import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { securityConfig } from "@/config/env";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/services/Auth/email/email.service";
import { hashPassword } from "@/services/Auth/password/password.service";
import { createSearchHash, decryptSensitiveData } from "@/services/Auth/data-protection/data-protection.service";
import {
  ForgotPasswordInput,
  ResetPasswordInput,
  VerifyPasswordResetCodeInput,
} from "@/types/auth.types";
import { PasswordResetChallengeNotFoundError } from "./PasswordResetChallengeNotFoundError";
import { PasswordResetCodeExpiredError } from "./PasswordResetCodeExpiredError";
import { PasswordResetBlockedError } from "./PasswordResetBlockedError";
import { InvalidPasswordResetCodeError } from "./InvalidPasswordResetCodeError";
import { InvalidPasswordResetTokenError } from "./InvalidPasswordResetTokenError";
import { isConfiguredMaster } from "@/services/Main/master/master-bootstrap.service";

export { PasswordResetChallengeNotFoundError } from "./PasswordResetChallengeNotFoundError";
export { PasswordResetCodeExpiredError } from "./PasswordResetCodeExpiredError";
export { PasswordResetBlockedError } from "./PasswordResetBlockedError";
export { InvalidPasswordResetCodeError } from "./InvalidPasswordResetCodeError";
export { InvalidPasswordResetTokenError } from "./InvalidPasswordResetTokenError";

const CODE_LIMIT = 1_000_000;
const PASSWORD_CODE_SEND_LIMIT = 3;
const PASSWORD_CODE_SEND_WINDOW_MS = 3_600_000;

type PasswordChangeSession = { userId: string; sessionId: string };
export class PasswordChangeUnavailableError extends Error {}

function challengeScope(session?: PasswordChangeSession) {
  return session ?? { sessionId: null };
}

function digest(value: string, salt: string) {
  return crypto.createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

function addMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60_000);
}

function addHours(hours: number) {
  return new Date(Date.now() + hours * 3_600_000);
}

export async function requestPasswordReset({ email }: ForgotPasswordInput) {
  return requestPasswordChallenge({ emailHash: createSearchHash(email) });
}

export async function requestAccountPasswordChange(session: PasswordChangeSession) {
  return requestPasswordChallenge({ id: session.userId }, session);
}

async function requestPasswordChallenge(where: Prisma.UserWhereUniqueInput, session?: PasswordChangeSession) {
  const user = await prisma.user.findUnique({
    where,
    select: { id: true, email: true, name: true, active: true, deletedAt: true, role: true, emailHash: true },
  });

  if (!user || !user.active || user.deletedAt || isConfiguredMaster(user)) {
    if (session) throw new PasswordChangeUnavailableError("A alteração de senha está indisponível para esta conta.");
    return {
      challengeId: crypto.randomUUID(),
      expiresAt: addMinutes(securityConfig.passwordResetCodeExpiresMinutes),
    };
  }

  const blockedChallenge = await prisma.passwordResetChallenge.findFirst({
    where: { userId: user.id, blockedUntil: { gt: new Date() } },
    orderBy: { blockedUntil: "desc" },
    select: { blockedUntil: true },
  });

  if (blockedChallenge?.blockedUntil) {
    if (session) throw new PasswordResetBlockedError("Alteração de senha bloqueada temporariamente", blockedChallenge.blockedUntil);
    return {
      challengeId: crypto.randomUUID(),
      expiresAt: addMinutes(securityConfig.passwordResetCodeExpiresMinutes),
    };
  }

  const code = crypto.randomInt(0, CODE_LIMIT).toString().padStart(6, "0");
  const codeSalt = crypto.randomBytes(32).toString("hex");

  let challenge: { id: string; expiresAt: Date };
  for (let attempt = 1; ; attempt++) {
    try {
      challenge = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const recentChallenges = await tx.passwordResetChallenge.findMany({
          where: {
            userId: user.id,
            createdAt: { gt: new Date(now.getTime() - PASSWORD_CODE_SEND_WINDOW_MS) },
          },
          orderBy: { createdAt: "desc" },
          take: PASSWORD_CODE_SEND_LIMIT,
          select: { createdAt: true },
        });
        if (recentChallenges.length === PASSWORD_CODE_SEND_LIMIT) {
          const oldest = recentChallenges[PASSWORD_CODE_SEND_LIMIT - 1];
          throw new PasswordResetBlockedError(
            "Limite de três envios de código por hora atingido.",
            new Date(oldest.createdAt.getTime() + PASSWORD_CODE_SEND_WINDOW_MS),
          );
        }

        await tx.passwordResetChallenge.updateMany({
          where: { userId: user.id, ...challengeScope(session), consumedAt: null },
          data: { consumedAt: now },
        });
        return tx.passwordResetChallenge.create({
          data: {
            userId: user.id, sessionId: session?.sessionId,
            codeHash: digest(code, codeSalt), codeSalt,
            expiresAt: addMinutes(securityConfig.passwordResetCodeExpiresMinutes),
          },
          select: { id: true, expiresAt: true },
        });
      }, { isolationLevel: "Serializable" });
      break;
    } catch (error) {
      if (error instanceof PasswordResetBlockedError && !session) {
        return {
          challengeId: crypto.randomUUID(),
          expiresAt: addMinutes(securityConfig.passwordResetCodeExpiresMinutes),
        };
      }
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 3) {
        throw error;
      }
    }
  }

  try {
    await sendEmail({
      to: decryptSensitiveData(user.email),
      subject: session ? "Alteração de senha ReciclaOnline" : "Recuperação de senha ReciclaOnline",
      textContent: `Olá, ${decryptSensitiveData(user.name)}.\n\nSeu código para redefinir a senha é: ${code}\n\nEle expira em ${securityConfig.passwordResetCodeExpiresMinutes} minutos. Se você não solicitou a recuperação, ignore este e-mail.`,
      htmlContent: `<p>Olá, ${decryptSensitiveData(user.name)}.</p><p>Seu código para redefinir a senha é:</p><p><strong>${code}</strong></p><p>Ele expira em ${securityConfig.passwordResetCodeExpiresMinutes} minutos.</p><p>Se você não solicitou a recuperação, ignore este e-mail.</p>`,
    });
  } catch (error) {
    if (session) {
      await prisma.passwordResetChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } });
      throw error;
    }
    console.error("Falha interna no envio do e-mail de recuperação:", error);
  }

  return { challengeId: challenge.id, expiresAt: challenge.expiresAt };
}

export async function verifyPasswordResetCode({ challengeId, code }: VerifyPasswordResetCodeInput, session?: PasswordChangeSession) {
  const challenge = await prisma.passwordResetChallenge.findUnique({ where: { id: challengeId, ...challengeScope(session) } });
  const now = new Date();

  if (!challenge || challenge.consumedAt || challenge.verifiedAt) {
    throw new PasswordResetChallengeNotFoundError("Desafio de recuperação não encontrado");
  }
  if (challenge.blockedUntil && challenge.blockedUntil > now) {
    throw new PasswordResetBlockedError("Recuperação de senha bloqueada temporariamente", challenge.blockedUntil);
  }
  if (challenge.expiresAt <= now) {
    throw new PasswordResetCodeExpiredError("Código de recuperação expirado");
  }

  const liveChallenge = { id: challenge.id, consumedAt: null, verifiedAt: null, attempts: challenge.attempts, expiresAt: { gt: now } };
  if (digest(code, challenge.codeSalt) !== challenge.codeHash) {
    const attempts = challenge.attempts + 1;
    const blockedUntil = attempts >= securityConfig.passwordResetMaxAttempts
      ? addHours(securityConfig.passwordResetBlockHours)
      : null;

    const updated = await prisma.passwordResetChallenge.updateMany({
      where: liveChallenge,
      data: { attempts, blockedUntil },
    });
    if (!updated.count) throw new InvalidPasswordResetCodeError("Código inválido ou expirado");

    if (blockedUntil) {
      throw new PasswordResetBlockedError(
        `Recuperação bloqueada por ${securityConfig.passwordResetBlockHours} horas`,
        blockedUntil
      );
    }
    throw new InvalidPasswordResetCodeError("Código de recuperação inválido");
  }

  const tokenSecret = crypto.randomBytes(48).toString("base64url");
  const resetToken = `${challenge.id}.${tokenSecret}`;
  const resetTokenSalt = crypto.randomBytes(32).toString("hex");
  const resetTokenExpiresAt = addMinutes(securityConfig.passwordResetTokenExpiresMinutes);

  const verified = await prisma.passwordResetChallenge.updateMany({
    where: liveChallenge,
    data: {
      verifiedAt: now,
      resetTokenHash: digest(tokenSecret, resetTokenSalt),
      resetTokenSalt,
      resetTokenExpiresAt,
    },
  });

  if (!verified.count) throw new InvalidPasswordResetCodeError("Código inválido ou expirado");
  return { resetToken, expiresAt: resetTokenExpiresAt };
}

export async function resetPassword({ resetToken, password }: ResetPasswordInput, session?: PasswordChangeSession) {
  const separator = resetToken.indexOf(".");
  const challengeId = separator > 0 ? resetToken.slice(0, separator) : "";
  const tokenSecret = separator > 0 ? resetToken.slice(separator + 1) : "";
  const challenge = challengeId
    ? await prisma.passwordResetChallenge.findFirst({
        where: {
          id: challengeId,
          ...challengeScope(session),
          verifiedAt: { not: null },
          consumedAt: null,
          resetTokenExpiresAt: { gt: new Date() },
          resetTokenHash: { not: null },
          resetTokenSalt: { not: null },
        },
        select: { id: true, userId: true, resetTokenHash: true, resetTokenSalt: true, user: { select: { role: true, emailHash: true } } },
      })
    : null;

  if (
    !challenge || isConfiguredMaster(challenge.user) ||
    digest(tokenSecret, challenge.resetTokenSalt!) !== challenge.resetTokenHash
  ) {
    throw new InvalidPasswordResetTokenError("Token de redefinição inválido ou expirado");
  }

  const hashedPassword = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    if (session && !await tx.session.findFirst({ where: { id: session.sessionId, userId: session.userId, revokedAt: null, expiresAt: { gt: now } } })) {
      throw new InvalidPasswordResetTokenError("Sessão expirada. Entre novamente para alterar a senha");
    }
    const consumed = await tx.passwordResetChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, resetTokenExpiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw new InvalidPasswordResetTokenError("Token de redefinição já utilizado");
    }
    await tx.user.update({
      where: { id: challenge.userId, active: true, deletedAt: null },
      data: { password: hashedPassword },
    });
    await tx.passwordResetChallenge.updateMany({ where: { userId: challenge.userId, consumedAt: null }, data: { consumedAt: now } });
    await tx.twoFactorChallenge.updateMany({ where: { userId: challenge.userId, consumedAt: null }, data: { consumedAt: now } });
    await tx.session.updateMany({
      where: { userId: challenge.userId, revokedAt: null, ...(session && { id: { not: session.sessionId } }) },
      data: { revokedAt: now },
    });
  });
}
