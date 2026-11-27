import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CreateTermDto } from "@/dto/terms/create-term.dto";
import { UpdateTermDto } from "@/dto/terms/update-term.dto";
import { TermNotFoundError } from "./TermNotFoundError";
import { CurrentTermNotFoundError } from "./CurrentTermNotFoundError";
import { TermAlreadyAcceptedError } from "./TermAlreadyAcceptedError";

export { TermNotFoundError } from "./TermNotFoundError";
export { CurrentTermNotFoundError } from "./CurrentTermNotFoundError";
export { TermAlreadyAcceptedError } from "./TermAlreadyAcceptedError";

type TermTypeValue = "USER" | "ADMIN";

export interface TermEntity {
  id: string;
  documentId: string;
  title: string | null;
  text: string;
  type: TermTypeValue;
  version: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TermAcceptResult {
  accepted: boolean;
  acceptedAt: Date;
  documentId: string;
  version: number;
}

function normalizeNullableText(value?: string) {
  const normalized = value?.trim();
  return normalized || null;
}

function termTypeForRole(role: Role): TermTypeValue {
  return role === Role.USER ? "USER" : "ADMIN";
}

async function getNextVersion(type: TermTypeValue, tx: Prisma.TransactionClient) {
  const latest = await tx.term.findFirst({
    where: { type },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  return (latest?.version ?? 0) + 1;
}

async function lockTermType(type: TermTypeValue, tx: Prisma.TransactionClient) {
  const audience = type === "USER" ? 1 : 2;
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(58347, ${audience}::integer)`;
}

export class TermVersionChangedError extends Error {}

async function createNewVersion(
  data: {
    title?: string;
    text: string;
    type: TermTypeValue;
  },
  tx: Prisma.TransactionClient
): Promise<TermEntity> {
  await lockTermType(data.type, tx);
  const version = await getNextVersion(data.type, tx);

  await tx.term.updateMany({
    where: {
      type: data.type,
      active: true,
    },
    data: { active: false },
  });

  return tx.term.create({
    data: {
      title: normalizeNullableText(data.title),
      text: data.text.trim(),
      type: data.type,
      version,
      active: true,
    },
  });
}

export async function createTerm(input: CreateTermDto): Promise<TermEntity> {
  return prisma.$transaction((tx) => createNewVersion(input, tx));
}

export async function updateTerm(documentId: string, input: UpdateTermDto): Promise<TermEntity> {
  return prisma.$transaction(async (tx) => {
    const existingTerm = await tx.term.findUnique({
      where: { documentId },
      select: { type: true },
    });

    if (!existingTerm) {
      throw new TermNotFoundError("Termo não encontrado");
    }

    return createNewVersion(
      {
        title: input.title,
        text: input.text,
        type: existingTerm.type,
      },
      tx
    );
  });
}

export function listTerms(): Promise<TermEntity[]> {
  return prisma.term.findMany({
    orderBy: [
      { type: "asc" },
      { version: "desc" },
    ],
  });
}

export async function getTermByDocumentId(documentId: string): Promise<TermEntity> {
  const term = await prisma.term.findUnique({
    where: { documentId },
  });

  if (!term) {
    throw new TermNotFoundError("Termo não encontrado");
  }

  return term;
}

export async function getCurrentTermByRole(role: Role, db: Prisma.TransactionClient = prisma): Promise<TermEntity> {
  const type = termTypeForRole(role);
  const term = await db.term.findFirst({
    where: {
      type,
      active: true,
    },
    orderBy: { version: "desc" },
  });

  if (!term) {
    throw new CurrentTermNotFoundError("Termo vigente não encontrado");
  }

  return term;
}

export async function getTermStatus(userId: string, role: Role) {
  const currentTerm = await getCurrentTermByRole(role);
  const latestAccepted = await prisma.termAccept.findFirst({
    where: {
      userId,
      term: {
        type: currentTerm.type,
      },
    },
    include: {
      term: {
        select: {
          version: true,
          documentId: true,
        },
      },
    },
    orderBy: {
      acceptedAt: "desc",
    },
  });

  return {
    accepted: latestAccepted?.termId === currentTerm.id && latestAccepted.accepted,
    currentVersion: currentTerm.version,
    acceptedVersion: latestAccepted?.term.version ?? null,
  };
}

export function listAcceptedTerms(userId: string) {
  return prisma.termAccept.findMany({
    where: { userId, accepted: true },
    orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
    select: {
      acceptedAt: true,
      term: { select: { documentId: true, title: true, text: true, version: true, type: true, active: true } },
    },
  });
}

export async function acceptCurrentTerm(
  userId: string,
  role: Role,
  documentId?: string,
): Promise<TermAcceptResult> {
  try {
    const accept = await prisma.$transaction(async (tx) => {
      await lockTermType(termTypeForRole(role), tx);
      const currentTerm = await getCurrentTermByRole(role, tx);
      if (documentId && currentTerm.documentId !== documentId) {
        throw new TermVersionChangedError("Os termos foram atualizados. Consulte a versão vigente antes de aceitar.");
      }
      return tx.termAccept.create({
        data: {
          userId,
          termId: currentTerm.id,
          accepted: true,
        },
        select: {
          accepted: true,
          acceptedAt: true,
          term: {
            select: {
              documentId: true,
              version: true,
            },
          },
        },
      });
    });

    return {
      accepted: accept.accepted,
      acceptedAt: accept.acceptedAt,
      documentId: accept.term.documentId,
      version: accept.term.version,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new TermAlreadyAcceptedError("Termo vigente já aceito");
    }

    throw err;
  }
}
