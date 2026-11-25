import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { RegisterInput } from "@/types/register.types";
import { RegisterResult } from "@/types/auth.types";
import { normalizeMunicipality, resolveMunicipality, sameLocation } from "@/services/Main/residents/municipality";
import { StoreError } from "@/services/Main/store/exceptions/StoreError";
import { hashPassword } from "../password/password.service";
import { createSearchHash, encryptSensitiveData } from "../data-protection/data-protection.service";

export class UserAlreadyExistsError extends Error {}

type Registration =
  | { role: typeof Role.USER; password: string }
  | { role: typeof Role.PrefeituraVendedor | typeof Role.COOPERATIVA; cnpj?: string };

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

export async function ensureAvailableIdentity(cpf: string, email: string, cpfHash: string, emailHash: string) {
  const existing = await prisma.user.findFirst({
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
    email,
  }: Omit<RegisterInput, "termsAccepted" | "password" | "passwordConfirmation">,
  registration: Registration,
): Promise<RegisterResult> {
  const { role } = registration;
  const firstLogin = role !== Role.USER;
  const normalizedEmail = normalizeText(email);
  const normalizedCpf = cpf.replace(/\D/g, "");
  const emailHash = createSearchHash(normalizedEmail);
  const cpfHash = createSearchHash(normalizedCpf);

  await ensureAvailableIdentity(normalizedCpf, normalizedEmail, cpfHash, emailHash);

  const location = normalizeMunicipality(await resolveMunicipality(cep));
  if (!sameLocation({ city: city ?? location.city, state: state ?? location.state }, location)) {
    throw new StoreError("Cidade e UF devem corresponder ao CEP", 400);
  }
  const municipality = await prisma.municipality.findUnique({ where: { city_state: location }, select: { id: true } });
  if (!municipality) throw new StoreError("Não há prefeitura cadastrada para o município deste CEP", 404);

  const hashedPassword = await hashPassword(registration.role === Role.USER ? registration.password : normalizedCpf);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: encryptSensitiveData(normalizeText(name)),
          cpf: encryptSensitiveData(normalizedCpf),
          cpfHash,
          birthDate: encryptSensitiveData(birthDate.toISOString()),
          phone: encryptSensitiveData(phone.replace(/\D/g, "")),
          cep: encryptSensitiveData(cep.replace(/\D/g, "")),
          address: encryptSensitiveData(normalizeText(address)),
          city: encryptSensitiveData(location.city),
          state: encryptSensitiveData(location.state),
          profilePhoto: profilePhoto ? encryptSensitiveData(normalizeText(profilePhoto)) : null,
          firstLogin,
          termsAccepted: !firstLogin,
          email: encryptSensitiveData(normalizedEmail),
          emailHash,
          password: hashedPassword,
          role,
          municipalityId: municipality.id,
          cnpj: "cnpj" in registration && registration.cnpj ? encryptSensitiveData(registration.cnpj) : undefined,
        },
        select: {
          id: true,
        },
      });
      if (role === Role.USER) {
        await tx.municipalWallet.create({ data: { userId: user.id, municipalityId: municipality.id } });
      }
      return user;
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
