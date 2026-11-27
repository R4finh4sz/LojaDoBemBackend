import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { RegisterInput } from "@/types/register.types";
import { RegisterResult } from "@/types/auth.types";
import { normalizeMunicipality, resolveMunicipality, sameLocation } from "@/services/Main/residents/municipality";
import { StoreError } from "@/services/Main/store/exceptions/StoreError";
import { sanitizeProfilePhoto } from "@/services/Main/account/profile-photo.service";
import { hashPassword } from "../password/password.service";
import { createSearchHash, encryptSensitiveData } from "../data-protection/data-protection.service";

export class UserAlreadyExistsError extends Error {}

type Registration =
  | { role: typeof Role.USER; password: string }
  | { role: typeof Role.PrefeituraVendedor | typeof Role.COOPERATIVA; password: string; cnpj?: string;
      db: Prisma.TransactionClient; id: string; termId: string };

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
    email,
  }: Omit<RegisterInput, "password" | "passwordConfirmation" | "termsAccepted">,
  registration: Registration,
): Promise<RegisterResult> {
  const { role } = registration;
  const photo = profilePhoto && /^data:/i.test(profilePhoto) ? await sanitizeProfilePhoto(profilePhoto) : profilePhoto;
  const invitation = registration.role === Role.USER ? undefined : registration;
  const normalizedEmail = normalizeText(email);
  const normalizedCpf = cpf.replace(/\D/g, "");
  const emailHash = createSearchHash(normalizedEmail);
  const cpfHash = createSearchHash(normalizedCpf);

  const db = invitation?.db ?? prisma;
  await ensureAvailableIdentity(normalizedCpf, normalizedEmail, cpfHash, emailHash, db);

  const location = normalizeMunicipality(invitation && city && state ? { city, state } : await resolveMunicipality(cep));
  if (!sameLocation({ city: city ?? location.city, state: state ?? location.state }, location)) {
    throw new StoreError("Cidade e UF devem corresponder ao CEP", 400);
  }
  const municipality = await db.municipality.findUnique({ where: { city_state: location }, select: { id: true } });
  if (!municipality) throw new StoreError("Não há prefeitura cadastrada para o município deste CEP", 404);

  const hashedPassword = await hashPassword(registration.password);

  try {
    const user = await db.user.create({
      data: {
        ...(invitation && {
          id: invitation.id,
          termAccepts: { create: { termId: invitation.termId, accepted: true } },
        }),
        ...(role === Role.USER && { municipalWallet: { create: { municipality: { connect: { id: municipality.id } } } } }),
        name: encryptSensitiveData(normalizeText(name)),
        cpf: encryptSensitiveData(normalizedCpf),
        cpfHash,
        birthDate: encryptSensitiveData(birthDate.toISOString()),
        phone: encryptSensitiveData(phone.replace(/\D/g, "")),
        cep: encryptSensitiveData(cep.replace(/\D/g, "")),
        address: encryptSensitiveData(normalizeText(address)),
        city: encryptSensitiveData(location.city),
        state: encryptSensitiveData(location.state),
        profilePhoto: photo ? encryptSensitiveData(photo) : null,
        termsAccepted: true,
        email: encryptSensitiveData(normalizedEmail),
        emailHash,
        password: hashedPassword,
        role,
        municipality: { connect: { id: municipality.id } },
        cnpj: invitation?.cnpj ? encryptSensitiveData(invitation.cnpj) : undefined,
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
