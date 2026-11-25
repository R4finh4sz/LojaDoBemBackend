import { Prisma, Role } from "@prisma/client";
import jwt from "jsonwebtoken";
import { authConfig } from "@/config/env";
import { prisma } from "@/lib/prisma";
import { createSearchHash } from "@/services/Auth/data-protection/data-protection.service";
import { hashPassword, verifyPassword } from "@/services/Auth/password/password.service";
import { issueSessionToken } from "@/services/Auth/session/session.service";
import type { SessionMetadata } from "@/services/Auth/session/session-metadata";
import { getCurrentTermByRole } from "@/services/Main/terms/terms.service";

export class FirstLoginError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

const audience = "first-login";

export function issueFirstLoginToken(userId: string) {
  return jwt.sign({}, authConfig.jwtSecret, { subject: userId, audience, expiresIn: "15m" });
}

async function getFirstLoginUser(token?: string) {
  let userId: string | undefined;
  try {
    const payload = jwt.verify(token ?? "", authConfig.jwtSecret, { audience });
    if (typeof payload !== "string") userId = payload.sub;
  } catch {
    throw new FirstLoginError("Token de primeiro acesso inválido ou expirado", 401);
  }
  if (!userId) throw new FirstLoginError("Token de primeiro acesso inválido ou expirado", 401);
  const user = await prisma.user.findUnique({
    where: { id: userId, active: true, deletedAt: null, firstLogin: true, role: { in: [Role.PrefeituraVendedor, Role.COOPERATIVA] } },
    select: { id: true, role: true, password: true, cpfHash: true },
  });
  if (!user) throw new FirstLoginError("Primeiro acesso indisponível. Entre novamente", 401);
  return user;
}

export async function getFirstLoginTerm(token?: string) {
  const user = await getFirstLoginUser(token);
  return getCurrentTermByRole(user.role);
}

export async function completeFirstLogin(
  token: string | undefined,
  { password, termDocumentId }: { password: string; termDocumentId: string },
  metadata?: SessionMetadata,
) {
  const user = await getFirstLoginUser(token);
  const cpf = password.trim().replace(/[.-]/g, "");
  if (createSearchHash(cpf) === user.cpfHash || await verifyPassword(password, user.password)) {
    throw new FirstLoginError("A nova senha deve ser diferente do CPF e da senha atual", 400);
  }
  const nextPassword = await hashPassword(password);

  try {
    await prisma.$transaction(async (tx) => {
      const term = await getCurrentTermByRole(user.role, tx);
      if (term.documentId !== termDocumentId) {
        throw new FirstLoginError("Os termos foram atualizados. Consulte e aceite a versão vigente", 409);
      }
      const completed = await tx.user.updateMany({
        where: { id: user.id, active: true, deletedAt: null, firstLogin: true, password: user.password },
        data: { password: nextPassword, firstLogin: false, termsAccepted: true },
      });
      if (!completed.count) throw new FirstLoginError("Primeiro acesso indisponível. Entre novamente", 409);
      await tx.termAccept.upsert({
        where: { userId_termId: { userId: user.id, termId: term.id } },
        create: { userId: user.id, termId: term.id, accepted: true },
        update: { accepted: true, acceptedAt: new Date() },
      });
      const now = new Date();
      await tx.twoFactorChallenge.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: now } });
      await tx.passwordResetChallenge.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: now } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new FirstLoginError("Primeiro acesso atualizado em outra solicitação. Entre novamente", 409);
    }
    throw error;
  }
  return issueSessionToken(user, metadata);
}
