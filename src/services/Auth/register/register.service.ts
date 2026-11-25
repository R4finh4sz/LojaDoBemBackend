import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { RegisterInput } from "@/types/register.types";
import { RegisterResult } from "@/types/auth.types";
import { hashPassword } from "../password/password.service";
import { createSearchHash, encryptSensitiveData } from "../data-protection/data-protection.service";

export class UserAlreadyExistsError extends Error {}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

export async function ensureAvailableIdentity(cpf: string, email: string, cpfHash: string, emailHash: string, db: Prisma.TransactionClient = prisma) {
  const existing = await db.user.findFirst({
    where: {
      OR: [{ cpfHash }, { emailHash }, { cpfHash: null, cpf }, { emailHash: null, email: { equals: email, mode: "insensitive" } }],
    },
    select: { id: true },
  });
  if (existing) throw new UserAlreadyExistsError("CPF ou e-mail já cadastrado");
}

export async function createUserWithRole(
  {
    name,
    cpf,
    birthDate,
    phone,
    cep,
    address,
    city,
    state,
    profilePhoto,
    termsAccepted,
    email,
    password,
  }: Omit<RegisterInput, "passwordConfirmation" | "termsAccepted"> & { termsAccepted: boolean },
  role: Role,
  cnpj?: string,
  options?: { db: Prisma.TransactionClient; id: string; termId: string },
): Promise<RegisterResult> {
  const normalizedEmail = normalizeText(email);
  const normalizedCpf = cpf.replace(/\D/g, "");
  const emailHash = createSearchHash(normalizedEmail);
  const cpfHash = createSearchHash(normalizedCpf);

  const db = options?.db ?? prisma;
  await ensureAvailableIdentity(normalizedCpf, normalizedEmail, cpfHash, emailHash, db);

  const hashedPassword = await hashPassword(password);

  try {
    const user = await db.user.create({
      data: {
        ...(options && {
          id: options.id,
          termAccepts: { create: { termId: options.termId, accepted: true } },
        }),
        name: encryptSensitiveData(normalizeText(name)),
        cpf: encryptSensitiveData(normalizedCpf),
        cpfHash,
        birthDate: encryptSensitiveData(birthDate.toISOString()),
        phone: encryptSensitiveData(phone.replace(/\D/g, "")),
        cep: encryptSensitiveData(cep.replace(/\D/g, "")),
        address: encryptSensitiveData(normalizeText(address)),
        city: encryptSensitiveData(normalizeText(city)),
        state: encryptSensitiveData(normalizeText(state)),
        profilePhoto: profilePhoto ? encryptSensitiveData(normalizeText(profilePhoto)) : null,
        termsAccepted,
        email: encryptSensitiveData(normalizedEmail),
        emailHash,
        password: hashedPassword,
        role,
        cnpj: cnpj ? encryptSensitiveData(cnpj) : undefined,
      },
      select: {
        id: true,
      },
    });

    return {
      user,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const fields = Array.isArray(err.meta?.target) ? err.meta.target : [];
      const message = fields.includes("cpfHash") ? "CPF já cadastrado" : "E-mail já cadastrado";

      throw new UserAlreadyExistsError(message);
    }

    throw err;
  }
}
