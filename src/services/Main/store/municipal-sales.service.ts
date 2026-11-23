import { Prisma } from "@prisma/client";
import { createSearchHash } from "@/services/Auth/data-protection/data-protection.service";
import { findResident } from "@/services/Main/residents/residents.service";
import { decryptedLocation, sameLocation } from "@/services/Main/residents/municipality";
import { auditedOperation, auditResponse, previousAudit } from "./store-audit.service";
import { StoreError } from "./exceptions/StoreError";
import { InsufficientBalanceError } from "./exceptions/InsufficientBalanceError";
import { InsufficientStockError } from "./exceptions/InsufficientStockError";

export function creditResident(actorId: string, cpf: string, value: string, requestKey: string) {
  const amount = new Prisma.Decimal(value);
  const requestHash = createSearchHash(JSON.stringify([cpf, amount.toFixed(2)]));
  return auditedOperation(async (tx) => {
    const prior = await previousAudit(tx, actorId, "CREDIT", requestKey, requestHash);
    if (prior) return auditResponse(prior);
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
    return auditResponse(await tx.storeAudit.create({
      data: {
        actorId, userId: user.id, operation: "CREDIT", requestKey, requestHash, amount,
        balanceBefore: user.ecoCoinBalance, balanceAfter,
      },
    }));
  });
}

export function registerMunicipalSale(actorId: string, userId: string, productId: string, quantity: number, requestKey: string) {
  const requestHash = createSearchHash(JSON.stringify([userId, productId, quantity]));
  return auditedOperation(async (tx) => {
    const prior = await previousAudit(tx, actorId, "SALE", requestKey, requestHash);
    if (prior) return auditResponse(prior);
    const [user, product, actor] = await Promise.all([
      tx.user.findUnique({ where: { id: userId } }),
      tx.product.findFirst({ where: { id: productId, adminId: actorId, active: true } }),
      tx.user.findUniqueOrThrow({ where: { id: actorId } }),
    ]);
    if (!product) throw new StoreError("Produto não encontrado", 404);
    if (!actor.active || actor.role !== "PrefeituraVendedor" || !user || user.role !== "USER" || user.deletedAt || (!user.active && !user.pendingActivation) ||
        !sameLocation(decryptedLocation(user), product) || !sameLocation(decryptedLocation(actor), product)) {
      throw new StoreError("Munícipe não encontrado neste município", 404);
    }
    const total = product.price.mul(quantity);
    if (user.ecoCoinBalance.lt(total)) throw new InsufficientBalanceError();
    const stock = await tx.product.updateMany({
      where: { id: productId, active: true, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (!stock.count) throw new InsufficientStockError();
    const debit = await tx.user.updateMany({
      where: { id: userId, deletedAt: null, ecoCoinBalance: { gte: total } },
      data: { ecoCoinBalance: { decrement: total } },
    });
    if (!debit.count) throw new InsufficientBalanceError();
    const now = new Date();
    const sale = await tx.redemption.create({
      data: {
        userId, productId, quantity, unitPrice: product.price, totalPrice: total,
        status: "COMPLETED", completedAt: now, expiresAt: now, validatedById: actorId,
      },
    });
    await tx.ecoCoinTransaction.create({
      data: { userId, grantedById: actorId, redemptionId: sale.id, type: "REDEMPTION", amount: total.negated() },
    });
    return auditResponse(await tx.storeAudit.create({
      data: {
        actorId, userId, operation: "SALE", requestKey, requestHash, productId, quantity,
        redemptionId: sale.id, amount: total.negated(),
        balanceBefore: user.ecoCoinBalance, balanceAfter: user.ecoCoinBalance.sub(total),
      },
    }));
  });
}
