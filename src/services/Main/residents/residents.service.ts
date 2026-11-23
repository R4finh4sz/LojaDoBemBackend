import { randomBytes, randomInt, randomUUID, timingSafeEqual } from "crypto";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSearchHash, decryptSensitiveData, encryptSensitiveData } from "@/services/Auth/data-protection/data-protection.service";
import { sendEmail } from "@/services/Auth/email/email.service";
import { hashPassword } from "@/services/Auth/password/password.service";
import { ensureAvailableIdentity } from "@/services/Auth/register/register.service";
import { StoreError } from "@/services/Main/store/exceptions/StoreError";
import { decryptedLocation, resolveMunicipality, sameLocation } from "./municipality";

export async function createResident(actorId: string, input: {
  name: string; cpf: string; birthDate: Date; cep: string;
  address: string; addressNumber: string; email: string; authorizationPdf?: string;
}) {
  const location = await resolveMunicipality(input.cep);
  const actor = await prisma.user.findUnique({ where: { id: actorId, active: true, role: { in: [Role.COOPERATIVA, Role.PrefeituraVendedor] } } });
  if (!actor || !sameLocation(decryptedLocation(actor), location)) {
    throw new StoreError("CEP fora do município do operador", 403);
  }
  const cpfHash = createSearchHash(input.cpf);
  const emailHash = createSearchHash(input.email);
  await ensureAvailableIdentity(input.cpf, input.email, cpfHash, emailHash);
  return prisma.user.create({
    data: {
      name: encryptSensitiveData(input.name),
      cpf: encryptSensitiveData(input.cpf),
      cpfHash,
      email: encryptSensitiveData(input.email),
      emailHash,
      birthDate: encryptSensitiveData(input.birthDate.toISOString()),
      cep: encryptSensitiveData(input.cep),
      address: encryptSensitiveData(input.address),
      addressNumber: encryptSensitiveData(input.addressNumber),
      authorizationPdf: input.authorizationPdf ? encryptSensitiveData(input.authorizationPdf) : undefined,
      city: encryptSensitiveData(location.city),
      state: encryptSensitiveData(location.state),
      phone: "",
      password: await hashPassword(randomBytes(32).toString("hex")),
      active: false,
      pendingActivation: true,
      preRegisteredById: actorId,
    },
    select: { id: true, pendingActivation: true, ecoCoinBalance: true },
  });
}

export async function findResident(tx: Prisma.TransactionClient, actorId: string, cpf: string) {
  const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
  const user = await tx.user.findUnique({ where: { cpfHash: createSearchHash(cpf) } });
  const accessible = user && actor.active && (actor.role === Role.MASTER
    ? user.pendingActivation
    : sameLocation(decryptedLocation(actor), decryptedLocation(user)));
  if (!user || !accessible || user.role !== Role.USER || user.deletedAt || (!user.active && !user.pendingActivation)) {
    throw new StoreError("Munícipe não encontrado", 404);
  }
  return user;
}

export async function startActivation(cpf: string) {
  const user = await prisma.user.findUnique({ where: { cpfHash: createSearchHash(cpf) } });
  const id = randomUUID();
  if (user?.pendingActivation && !user.deletedAt) {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const now = new Date();
    const challenge = { id, codeHash: createSearchHash(`${id}:${code}`), expiresAt: new Date(now.getTime() + 15 * 60_000) };
    const current = await prisma.residentActivation.upsert({
      where: { userId: user.id },
      create: { ...challenge, userId: user.id },
      update: {},
    });
    if (current.id !== id) {
      const renewed = await prisma.residentActivation.updateMany({
        where: { id: current.id, expiresAt: { lte: now } },
        data: { ...challenge, tokenHash: null, attempts: 0 },
      });
      if (!renewed.count) return { challengeId: id };
    }
    try {
      await sendEmail({
        to: decryptSensitiveData(user.email), name: "",
        subject: "Ativação da sua conta Loja do Bem",
        htmlContent: `<p>Seu código de ativação é <strong>${code}</strong>. Ele expira em 15 minutos.</p>`,
      });
    } catch {
      await prisma.residentActivation.deleteMany({ where: { id } });
    }
  }
  return { challengeId: id };
}

export async function confirmActivation(challengeId: string, code: string) {
  const challenge = await prisma.residentActivation.findUnique({ where: { id: challengeId } });
  const invalid = new StoreError("Código inválido ou expirado", 400);
  if (!challenge) throw invalid;
  const available = { id: challengeId, expiresAt: { gt: new Date() }, tokenHash: null, attempts: { lt: 5 } };
  if (!timingSafeEqual(Buffer.from(challenge.codeHash), Buffer.from(createSearchHash(`${challengeId}:${code}`)))) {
    await prisma.residentActivation.updateMany({ where: available, data: { attempts: { increment: 1 } } });
    throw invalid;
  }
  const token = randomBytes(32).toString("hex");
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.residentActivation.updateMany({ where: available, data: { tokenHash: createSearchHash(token) } });
    if (!claimed.count) throw invalid;
    const user = await tx.user.findUniqueOrThrow({ where: { id: challenge.userId } });
    if (!user.pendingActivation || user.deletedAt) throw invalid;
    return {
      activationToken: token,
      resident: {
        name: decryptSensitiveData(user.name),
        email: decryptSensitiveData(user.email),
        birthDate: decryptSensitiveData(user.birthDate),
        cep: decryptSensitiveData(user.cep),
        address: decryptSensitiveData(user.address),
        addressNumber: user.addressNumber ? decryptSensitiveData(user.addressNumber) : null,
        ...decryptedLocation(user),
      },
    };
  });
}

export async function activateResident(challengeId: string, token: string, phone: string, password: string) {
  const hashedPassword = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const where = { id: challengeId, tokenHash: createSearchHash(token), expiresAt: { gt: new Date() } };
    const challenge = await tx.residentActivation.findFirst({ where });
    if (!challenge || !(await tx.residentActivation.deleteMany({ where })).count) {
      throw new StoreError("Ativação inválida ou expirada", 400);
    }
    const activated = await tx.user.updateMany({
      where: { id: challenge.userId, pendingActivation: true, deletedAt: null },
      data: { active: true, pendingActivation: false, phone: encryptSensitiveData(phone), password: hashedPassword, termsAccepted: true },
    });
    if (!activated.count) throw new StoreError("Pré-cadastro não encontrado", 404);
    return { id: challenge.userId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
