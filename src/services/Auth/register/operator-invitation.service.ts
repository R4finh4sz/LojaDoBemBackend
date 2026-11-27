import { randomUUID } from "node:crypto";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSearchHash, decryptSensitiveData, encryptSensitiveData } from "@/services/Auth/data-protection/data-protection.service";
import { sendEmail } from "@/services/Auth/email/email.service";
import { normalizeMunicipality } from "@/services/Main/residents/municipality";
import { getCurrentTermByRole } from "@/services/Main/terms/terms.service";
import { StoreError } from "@/services/Main/store/exceptions/StoreError";
import type { RegisterInput } from "@/types/register.types";
import { createUserWithRole, ensureAvailableIdentity } from "./register.service";

type OperatorRole = typeof Role.PrefeituraVendedor | typeof Role.COOPERATIVA;
type OperatorDetails = Omit<RegisterInput, "termsAccepted" | "password" | "passwordConfirmation"> & { city: string; state: string };
type Invitation = {
  purpose: "operator-invitation";
  id: string;
  expiresAt: number;
  role: OperatorRole;
  details: Omit<OperatorDetails, "birthDate"> & { birthDate: string };
  cnpj?: string;
};

export const operatorInvitationPath = "/auth/register/operator-invitation";

export async function sendOperatorInvitation(details: OperatorDetails, role: OperatorRole, cnpj?: string) {
  await getCurrentTermByRole(role);
  const municipality = await prisma.municipality.findUnique({
    where: { city_state: normalizeMunicipality(details) }, select: { id: true },
  });
  if (!municipality) throw new StoreError("Não há prefeitura cadastrada para o município deste CEP", 404);
  await ensureAvailableIdentity(details.cpf, details.email, createSearchHash(details.cpf), createSearchHash(details.email));
  const invitation: Invitation = {
    purpose: "operator-invitation",
    id: randomUUID(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    role,
    details: { ...details, birthDate: details.birthDate.toISOString() },
    cnpj,
  };
  const base = process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3000}`;
  const url = new URL(operatorInvitationPath, base);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new StoreError("Configure PUBLIC_API_URL com uma URL HTTPS", 503);
  }
  const token = encryptSensitiveData(JSON.stringify(invitation));
  if (token.length > 8192) throw new StoreError("Os dados do convite excedem o tamanho permitido", 400);
  url.searchParams.set("token", token);
  await sendEmail({
    to: details.email,
    subject: "Convite para ativar sua conta ReciclaOnline",
    textContent: `Abra o link para ler os termos e definir sua senha. O convite expira em 24 horas.\n\n${url.href}`,
    htmlContent: `<p>Você recebeu um convite para ativar sua conta ReciclaOnline.</p><p><a href="${url.href}">Ler os termos e definir senha</a></p><p>O convite expira em 24 horas.</p>`,
  });
  return { message: "Convite enviado por e-mail. A conta será criada após o aceite dos termos." };
}

export function readOperatorInvitation(token: unknown): Invitation {
  try {
    if (typeof token !== "string" || token.length > 8192 || !token.startsWith("enc:v1:")) throw new Error();
    const invitation = JSON.parse(decryptSensitiveData(token)) as Invitation;
    if (invitation.purpose !== "operator-invitation" ||
        (invitation.role !== Role.COOPERATIVA && invitation.role !== Role.PrefeituraVendedor) ||
        !Number.isFinite(invitation.expiresAt) || invitation.expiresAt <= Date.now()) throw new Error();
    return invitation;
  } catch {
    throw new StoreError("Convite inválido ou expirado", 400);
  }
}

export async function acceptOperatorInvitation(invitation: Invitation, documentId: string, password: string) {
  await prisma.$transaction(async (db) => {
    const term = await getCurrentTermByRole(invitation.role, db);
    if (term.documentId !== documentId) {
      throw new StoreError("O termo foi atualizado. Abra o convite novamente para ler a versão vigente.", 409);
    }
    await createUserWithRole({
      ...invitation.details,
      birthDate: new Date(invitation.details.birthDate),
    }, { role: invitation.role, password, cnpj: invitation.cnpj, db, id: invitation.id, termId: term.id });
  }, { isolationLevel: "Serializable" });
}
