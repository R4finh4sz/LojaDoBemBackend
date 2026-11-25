import crypto from "crypto";
import { securityConfig } from "@/config/env";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/services/Auth/email/email.service";
import { issueSessionToken } from "@/services/Auth/session/session.service";
import type { SessionMetadata } from "@/services/Auth/session/session-metadata";
import { AuthResult, VerifyTwoFactorInput } from "@/types/auth.types";
import { TwoFactorChallengeNotFoundError } from "./TwoFactorChallengeNotFoundError";
import { TwoFactorChallengeExpiredError } from "./TwoFactorChallengeExpiredError";
import { TwoFactorChallengeBlockedError } from "./TwoFactorChallengeBlockedError";
import { InvalidTwoFactorCodeError } from "./InvalidTwoFactorCodeError";
import { TwoFactorInactiveUserError } from "./TwoFactorInactiveUserError";

export { TwoFactorChallengeNotFoundError } from "./TwoFactorChallengeNotFoundError";
export { TwoFactorChallengeExpiredError } from "./TwoFactorChallengeExpiredError";
export { TwoFactorChallengeBlockedError } from "./TwoFactorChallengeBlockedError";
export { InvalidTwoFactorCodeError } from "./InvalidTwoFactorCodeError";
export { TwoFactorInactiveUserError } from "./TwoFactorInactiveUserError";

const CODE_LENGTH = 6;

function createCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(CODE_LENGTH, "0");
}

function hashCode(code: string, salt: string) {
  return crypto.createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

function createCodeSalt() {
  return crypto.randomBytes(32).toString("hex");
}

function getChallengeExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + securityConfig.twoFactorCodeExpiresMinutes);

  return expiresAt;
}

export async function createTwoFactorChallenge(user: { id: string; email: string; name: string }) {
  const code = createCode();
  const codeSalt = createCodeSalt();
  const codeHash = hashCode(code, codeSalt);

  await prisma.twoFactorChallenge.updateMany({
    where: {
      userId: user.id,
      consumedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    data: {
      consumedAt: new Date(),
    },
  });

  const challenge = await prisma.twoFactorChallenge.create({
    data: {
      userId: user.id,
      codeHash,
      codeSalt,
      expiresAt: getChallengeExpiresAt(),
    },
    select: {
      id: true,
      expiresAt: true,
    },
  });

  await sendEmail({
    to: user.email,
    subject: "Código de verificação ReciclaOnline",
    textContent: [
      "Olá,",
      "",
      "Recebemos uma solicitação para verificar sua identidade.",
      "",
      "Seu código de verificação é:",
      "",
      `${code}`,
      "",
      `Este código expira em ${securityConfig.twoFactorCodeExpiresMinutes} minutos.`,
      "",
      "Por motivos de segurança:",
      "- Nunca compartilhe este código com ninguém.",
      "- Nossa equipe nunca solicitará esse código por telefone, e-mail ou mensagem.",
      "- Se você não solicitou este código, ignore este e-mail. Nenhuma ação adicional será necessária.",
      "",
      "Atenciosamente,",
      "",
      "Equipe ReciclaOnline",
    ].join("\n"),
    htmlContent: `<p>Olá,</p><p>Recebemos uma solicitação para verificar sua identidade.</p><p>Seu código de verificação é:</p><p><strong>${code}</strong></p><p>⏱️ Este código expira em ${securityConfig.twoFactorCodeExpiresMinutes} minutos.</p><p>Por motivos de segurança:</p><ul><li>Nunca compartilhe este código com ninguém.</li><li>Nossa equipe nunca solicitará esse código por telefone, e-mail ou mensagem.</li><li>Se você não solicitou este código, ignore este e-mail. Nenhuma ação adicional será necessária.</li></ul><p>Atenciosamente,</p><p><strong>Equipe ReciclaOnline</strong></p>`,
  });

  return challenge;
}

export async function verifyTwoFactorChallenge(challengeId: string, code: string) {
  const challenge = await prisma.twoFactorChallenge.findUnique({
    where: { id: challengeId },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          active: true,
          twoFactorEnabled: true,
        },
      },
    },
  });

  if (!challenge || challenge.consumedAt || !challenge.user.twoFactorEnabled) {
    throw new TwoFactorChallengeNotFoundError("Desafio 2FA não encontrado");
  }

  if (challenge.expiresAt <= new Date()) {
    throw new TwoFactorChallengeExpiredError("Código 2FA expirado");
  }

  if (challenge.attempts >= securityConfig.twoFactorMaxAttempts) {
    throw new TwoFactorChallengeBlockedError("Código 2FA bloqueado por excesso de tentativas");
  }

  const candidateHash = hashCode(code, challenge.codeSalt);
  if (candidateHash !== challenge.codeHash) {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.twoFactorChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: securityConfig.twoFactorMaxAttempts } },
        data: { attempts: { increment: 1 } },
      });
      if (!updated.count) return null;
      const state = await tx.twoFactorChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
      if (state.attempts === securityConfig.twoFactorMaxAttempts) {
        await tx.securityEvent.create({ data: { kind: "TWO_FACTOR_BLOCK", blockedUntil: state.expiresAt } });
      }
      return state;
    });
    if (!result || result.attempts >= securityConfig.twoFactorMaxAttempts) {
      throw new TwoFactorChallengeBlockedError("Código 2FA bloqueado por excesso de tentativas");
    }

    throw new InvalidTwoFactorCodeError("Código 2FA inválido");
  }

  const consumed = await prisma.twoFactorChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: securityConfig.twoFactorMaxAttempts }, user: { twoFactorEnabled: true } },
    data: {
      consumedAt: new Date(),
    },
  });
  if (!consumed.count) throw new TwoFactorChallengeNotFoundError("Desafio 2FA indisponível");

  return challenge.user;
}

export async function verifyTwoFactor({ challengeId, code }: VerifyTwoFactorInput, metadata?: SessionMetadata): Promise<AuthResult> {
  const user = await verifyTwoFactorChallenge(challengeId, code);

  if (!user.active) {
    throw new TwoFactorInactiveUserError("Usuário desativado");
  }

  return issueSessionToken(user, metadata);
}
