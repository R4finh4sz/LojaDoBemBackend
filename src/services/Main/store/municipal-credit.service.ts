import { Prisma } from "@prisma/client";
import { createSearchHash, decryptSensitiveData } from "@/services/Auth/data-protection/data-protection.service";
import { findResident } from "@/services/Main/residents/residents.service";
import { auditedOperation, auditResponse, previousAudit } from "./store-audit.service";
import { StoreError } from "./exceptions/StoreError";

export function creditResident(actorId: string, cpf: string, value: string, requestKey: string) {
  const amount = new Prisma.Decimal(value);
  const requestHash = createSearchHash(JSON.stringify([cpf, amount.toFixed(2)]));
  return auditedOperation(async (tx) => {
    const prior = await previousAudit(tx, actorId, "CREDIT", requestKey, requestHash);
    if (prior) {
      const resident = await tx.user.findUnique({ where: { id: prior.userId, deletedAt: null }, select: { name: true } });
      return { ...auditResponse(prior), residentName: resident?.name ? decryptSensitiveData(resident.name) : null };
    }
    const user = await findResident(tx, actorId, cpf);
    const balanceAfter = user.ecoCoinBalance.add(amount);
    const pending = await tx.redemption.aggregate({
      where: { userId: user.id, status: "PENDING" }, _sum: { totalPrice: true },
    });
    if (balanceAfter.add(pending._sum.totalPrice ?? 0).gt("9999999999.99")) {
      throw new StoreError("Limite de saldo excedido", 409);
    }
    await tx.user.update({ where: { id: user.id }, data: { ecoCoinBalance: { increment: amount } } });
    await tx.ecoCoinTransaction.create({ data: { userId: user.id, grantedById: actorId, type: "CREDIT", amount } });
    const audit = await tx.storeAudit.create({
      data: {
        actorId, userId: user.id, operation: "CREDIT", requestKey, requestHash, amount,
        balanceBefore: user.ecoCoinBalance, balanceAfter,
      },
    });
    return { ...auditResponse(audit), residentName: decryptSensitiveData(user.name) };
  });
}
