import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { StoreError } from "./exceptions/StoreError";

export async function auditedOperation<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
      const auditKeyConflict = error.code === "P2002" && Array.isArray(error.meta?.target) &&
        error.meta.target.includes("requestKey");
      if (error.code !== "P2034" && !auditKeyConflict) throw error;
      if (attempt === 3) throw new StoreError("Operação concorrente. Tente novamente", 409);
    }
  }
}

export async function previousAudit(
  tx: Prisma.TransactionClient, actorId: string, operation: string, requestKey: string, requestHash: string,
) {
  const record = await tx.storeAudit.findUnique({
    where: { actorId_operation_requestKey: { actorId, operation, requestKey } },
  });
  if (record && record.requestHash !== requestHash) {
    throw new StoreError("Chave de idempotência já usada com outros dados", 409);
  }
  return record;
}

export function auditResponse(record: { id: string; userId: string; balanceAfter: Prisma.Decimal; redemptionId: string | null }) {
  return { auditId: record.id, userId: record.userId, ecoCoinBalance: record.balanceAfter, saleId: record.redemptionId };
}
