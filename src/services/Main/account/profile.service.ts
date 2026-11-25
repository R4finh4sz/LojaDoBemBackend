import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSensitiveData, encryptSensitiveData } from "@/services/Auth/data-protection/data-protection.service";
import { resolveMunicipality } from "@/services/Main/residents/municipality";
import type { profileUpdateSchema } from "@/validation/profile-update.validation";
import type { z } from "zod";
import { AccountError } from "./account.service";
import { verifyPassword } from "@/services/Auth/password/password.service";

const profileFields = { name: true, email: true, cep: true, city: true, state: true, municipalityId: true, address: true, addressNumber: true, jobTitle: true, profilePhoto: true, twoFactorEnabled: true } satisfies Prisma.UserSelect;

function profileData(user: Prisma.UserGetPayload<{ select: typeof profileFields }>) {
  return {
    name: decryptSensitiveData(user.name),
    email: decryptSensitiveData(user.email),
    cep: decryptSensitiveData(user.cep),
    city: decryptSensitiveData(user.city),
    state: decryptSensitiveData(user.state),
    municipalityId: user.municipalityId,
    address: decryptSensitiveData(user.address),
    addressNumber: user.addressNumber ? decryptSensitiveData(user.addressNumber) : null,
    jobTitle: user.jobTitle ? decryptSensitiveData(user.jobTitle) : null,
    profilePhoto: user.profilePhoto ? decryptSensitiveData(user.profilePhoto) : null,
    twoFactorEnabled: user.twoFactorEnabled,
  };
}

export async function updateAccountTwoFactor(userId: string, { enabled, password }: { enabled: boolean; password: string }) {
  const account = { id: userId, active: true, deletedAt: null };
  const user = await prisma.user.findUnique({ where: account, select: { password: true } });
  if (!user || !await verifyPassword(password, user.password)) {
    throw new AccountError("Senha atual inválida", 403);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { ...account, password: user.password },
      data: { twoFactorEnabled: enabled },
    });
    if (!updated.count) throw new AccountError("Senha atual inválida", 403);
    await tx.twoFactorChallenge.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return { twoFactorEnabled: enabled };
  });
}

export async function getAccountProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId, active: true, deletedAt: null }, select: profileFields });
  if (!user) throw new AccountError("Conta não encontrada", 404);
  return profileData(user);
}

export async function updateAccountProfile(userId: string, { cep, address, addressNumber }: z.infer<typeof profileUpdateSchema>) {
  const location = cep === undefined ? undefined : await resolveMunicipality(cep);
  try {
    const user = await prisma.user.update({
      where: { id: userId, active: true, deletedAt: null },
      data: {
        address: address === undefined ? undefined : encryptSensitiveData(address),
        addressNumber: addressNumber === undefined ? undefined : addressNumber ? encryptSensitiveData(addressNumber) : null,
        cep: cep === undefined ? undefined : encryptSensitiveData(cep),
        city: location && encryptSensitiveData(location.city),
        state: location && encryptSensitiveData(location.state),
      },
      select: profileFields,
    });
    return profileData(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new AccountError("Conta não encontrada", 404);
    }
    throw error;
  }
}
