import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { masterConfig } from "@/config/env";
import { prisma } from "@/lib/prisma";
import { createSearchHash, encryptSensitiveData } from "@/services/Auth/data-protection/data-protection.service";
import { hashPassword, verifyPassword } from "@/services/Auth/password/password.service";

export class MasterBootstrapError extends Error {}

export function isConfiguredMaster(user: { role: Role; emailHash: string | null }) {
  return Boolean(masterConfig.email && masterConfig.password && user.role === Role.MASTER &&
    user.emailHash === createSearchHash(masterConfig.email));
}

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).refine((password) => Buffer.byteLength(password, "utf8") <= 72),
});

export async function ensureConfiguredMaster() {
  const parsed = credentialsSchema.safeParse(masterConfig);
  if (!parsed.success) {
    throw new MasterBootstrapError("Configure MASTER_EMAIL válido e MASTER_PASSWORD com pelo menos 12 caracteres e até 72 bytes");
  }
  const { email, password } = parsed.data;
  const emailHash = createSearchHash(email);

  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        const identity = await tx.masterIdentity.findUnique({ where: { id: 1 } });
        if (identity && !(await tx.user.findFirst({
          where: { id: identity.userId, role: Role.MASTER, active: true, deletedAt: null },
          select: { id: true },
        }))) throw new MasterBootstrapError("A conta MASTER original não está ativa. A API não pode iniciar");

        const account = await tx.user.findFirst({
          where: { deletedAt: null, OR: [{ emailHash }, { emailHash: null, email: { equals: email, mode: "insensitive" } }] },
        });
        if (account && account.role !== Role.MASTER) {
          throw new MasterBootstrapError("MASTER_EMAIL já pertence a uma conta com outro perfil");
        }
        if (!account) {
          const existing = await tx.user.findFirst({ where: { role: Role.MASTER, deletedAt: null }, select: { id: true } });
          if (existing) throw new MasterBootstrapError("MASTER_EMAIL deve corresponder ao MASTER existente");
          await tx.user.create({ data: {
            role: Role.MASTER, name: encryptSensitiveData("Master"), email: encryptSensitiveData(email), emailHash,
            password: await hashPassword(password), cpf: "", birthDate: "", phone: "", cep: "", address: "", city: "", state: "",
          } });
          return;
        }
        if (!account.active) throw new MasterBootstrapError("A conta MASTER configurada está desativada");
        const passwordChanged = !(await verifyPassword(password, account.password));
        if (passwordChanged || account.emailHash !== emailHash) {
          await tx.user.update({ where: { id: account.id }, data: {
            email: encryptSensitiveData(email), emailHash,
            password: passwordChanged ? await hashPassword(password) : undefined,
          } });
        }
        if (passwordChanged) {
          const now = new Date();
          await tx.session.updateMany({ where: { userId: account.id, revokedAt: null }, data: { revokedAt: now } });
          await tx.twoFactorChallenge.updateMany({ where: { userId: account.id, consumedAt: null }, data: { consumedAt: now } });
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2002", "P2034"].includes(error.code) || attempt === 3) throw error;
    }
  }
}

export async function hasActiveMaster() {
  const identity = await prisma.masterIdentity.findUnique({ where: { id: 1 } });
  return identity !== null && (await prisma.user.count({
    where: { id: identity.userId, role: Role.MASTER, active: true, deletedAt: null },
  })) === 1;
}
