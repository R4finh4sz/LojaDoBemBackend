import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSensitiveData, encryptSensitiveData } from "@/services/Auth/data-protection/data-protection.service";
import { AccountError } from "./account.service";
import { verifyPassword } from "@/services/Auth/password/password.service";

const profileFields = { email: true, jobTitle: true, profilePhoto: true, twoFactorEnabled: true } satisfies Prisma.UserSelect;

function profileData(user: Prisma.UserGetPayload<{ select: typeof profileFields }>) {
  return {
    email: decryptSensitiveData(user.email),
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

export async function updateAccountProfile(userId: string, { jobTitle, profilePhoto }: { jobTitle?: string; profilePhoto?: string }) {
  try {
    const user = await prisma.user.update({
      where: { id: userId, active: true, deletedAt: null },
      data: {
        jobTitle: jobTitle === undefined ? undefined : jobTitle ? encryptSensitiveData(jobTitle) : null,
        profilePhoto: profilePhoto === undefined ? undefined : encryptSensitiveData(profilePhoto),
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
