import { Prisma, Role } from "@prisma/client";
import { createSearchHash, decryptSensitiveData } from "@/services/Auth/data-protection/data-protection.service";
import { findResident } from "@/services/Main/residents/residents.service";
import { auditedOperation, auditResponse, previousAudit } from "./store-audit.service";
import { StoreError } from "./exceptions/StoreError";

export function creditResident(actorId: string, cpf: string, value: string, requestKey: string) {
  const amount = new Prisma.Decimal(value);
  const requestHash = createSearchHash(JSON.stringify([cpf, amount.toFixed(2)]));
  return auditedOperation(async (tx) => {
    const issuer = await tx.user.findUnique({
      where: { id: actorId, role: Role.COOPERATIVA, active: true, deletedAt: null },
      select: { municipalityId: true },
    });
    if (!issuer?.municipalityId) throw new StoreError("Emissão disponível para cooperativas vinculadas a uma prefeitura", 403);
    const prior = await previousAudit(tx, actorId, "CREDIT", requestKey, requestHash);
    if (prior) {
      const resident = await tx.user.findUnique({ where: { id: prior.userId, deletedAt: null }, select: { name: true } });
      return { ...auditResponse(prior), residentName: resident?.name ? decryptSensitiveData(resident.name) : null };
    }
    const user = await findResident(tx, actorId, cpf);
    const wallet = user.municipalWallet;
    if (!wallet || wallet.municipalityId !== user.municipalityId) throw new StoreError("Munícipe sem carteira vinculada à prefeitura", 409);
    const balanceAfter = wallet.balance.add(amount);
    const pending = await tx.redemption.aggregate({
      where: { userId: user.id, status: "PENDING" }, _sum: { totalPrice: true },
    });
    if (balanceAfter.add(pending._sum.totalPrice ?? 0).gt("9999999999.99")) {
      throw new StoreError("Limite de saldo excedido", 409);
    }
    await tx.municipalWallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
    await tx.ecoCoinTransaction.create({ data: { userId: user.id, municipalityId: wallet.municipalityId, grantedById: actorId, type: "CREDIT", amount } });
    const audit = await tx.storeAudit.create({
      data: {
        actorId, userId: user.id, municipalityId: wallet.municipalityId, operation: "CREDIT", requestKey, requestHash, amount,
        balanceBefore: wallet.balance, balanceAfter,
      },
    });
    return { ...auditResponse(audit), residentName: decryptSensitiveData(user.name) };
  });
}
