import { randomBytes } from "crypto";
import { Prisma, RedemptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSearchHash, decryptSensitiveData } from "@/services/Auth/data-protection/data-protection.service";
import { decryptedLocation, sameLocation } from "@/services/Main/residents/municipality";
import { StoreError } from "./exceptions/StoreError";
import { InsufficientBalanceError } from "./exceptions/InsufficientBalanceError";
import { InsufficientStockError } from "./exceptions/InsufficientStockError";
import { auditedOperation, previousAudit } from "./store-audit.service";

export { StoreError } from "./exceptions/StoreError";

const REDEMPTION_DAYS = 5;
const productPublicSelect = {
  id: true, name: true, description: true, photo: true, price: true,
  quantity: true, city: true, state: true, active: true, createdAt: true, updatedAt: true,
} satisfies Prisma.ProductSelect;
const redemptionPublicSelect = {
  id: true, quantity: true, unitPrice: true, totalPrice: true, pickupCode: true,
  status: true, expiresAt: true, completedAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.RedemptionSelect;

function decryptPickupUser<T extends { user?: { name: string } }>(value: T): T {
  if (value.user) value.user.name = decryptSensitiveData(value.user.name);
  return value;
}

export async function createProduct(adminId: string, input: { name: string; description: string; photo: string; price: string; quantity: number }) {
  return auditedOperation(async (tx) => {
    const admin = await tx.user.findUnique({ where: { id: adminId, active: true }, select: { city: true, state: true } });
    if (!admin) throw new StoreError("Administrador não encontrado", 404);
    const location = decryptedLocation(admin);
    return tx.product.create({ data: { ...input, adminId, city: location.city, state: location.state }, select: productPublicSelect });
  });
}

export async function listProductsForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { city: true, state: true } });
  if (!user) throw new StoreError("Usuário não encontrado", 404);
  const location = decryptedLocation(user);
  return prisma.product.findMany({
    where: { city: { equals: location.city, mode: "insensitive" }, state: { equals: location.state, mode: "insensitive" }, active: true, admin: { active: true }, quantity: { gt: 0 } },
    orderBy: { createdAt: "desc" },
    select: productPublicSelect,
  });
}

export async function listAdminProducts(adminId: string) {
  return prisma.product.findMany({ where: { adminId }, orderBy: { createdAt: "desc" }, select: productPublicSelect });
}

export async function getEcoCoinBalance(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { ecoCoinBalance: true } });
  if (!user) throw new StoreError("Usuário não encontrado", 404);
  return user.ecoCoinBalance;
}

export async function redeemProduct(userId: string, productId: string, quantity: number, requestKey?: string) {
  const requestHash = createSearchHash(JSON.stringify([productId, quantity]));
  const select = { ...redemptionPublicSelect, product: { select: productPublicSelect } };
  return auditedOperation(async (tx) => {
    if (requestKey) {
      const prior = await previousAudit(tx, userId, "APP_PURCHASE", requestKey, requestHash);
      if (prior?.redemptionId) return tx.redemption.findUnique({ where: { id: prior.redemptionId }, select });
    }
    const [user, product] = await Promise.all([
      tx.user.findUnique({ where: { id: userId, active: true, deletedAt: null }, select: { city: true, state: true, ecoCoinBalance: true } }),
      tx.product.findUnique({ where: { id: productId, admin: { active: true } } }),
    ]);
    if (!user || !product || !product.active) throw new StoreError("Produto não encontrado", 404);
    if (!sameLocation(decryptedLocation(user), product)) throw new StoreError("Produto indisponível para a sua cidade", 403);
    const total = product.price.mul(quantity);
    const stock = await tx.product.updateMany({ where: { id: productId, active: true, quantity: { gte: quantity } }, data: { quantity: { decrement: quantity } } });
    if (!stock.count) throw new InsufficientStockError();
    const balance = await tx.user.updateMany({ where: { id: userId, active: true, ecoCoinBalance: { gte: total } }, data: { ecoCoinBalance: { decrement: total } } });
    if (!balance.count) throw new InsufficientBalanceError();
    const expiresAt = new Date(Date.now() + REDEMPTION_DAYS * 24 * 60 * 60 * 1000);
    const redemption = await tx.redemption.create({ data: { userId, productId, quantity, unitPrice: product.price, totalPrice: total, pickupCode: randomBytes(6).toString("hex").toUpperCase(), expiresAt } });
    await tx.ecoCoinTransaction.create({ data: { userId, redemptionId: redemption.id, type: "REDEMPTION", amount: total.negated() } });
    await tx.storeAudit.create({
      data: {
        actorId: userId, userId, operation: "APP_PURCHASE", amount: total.negated(),
        balanceBefore: user.ecoCoinBalance, balanceAfter: user.ecoCoinBalance.sub(total),
        productId, quantity, redemptionId: redemption.id, requestKey, requestHash: requestKey ? requestHash : undefined,
      },
    });
    return tx.redemption.findUnique({
      where: { id: redemption.id },
      select,
    });
  });
}

export async function expirePendingRedemptions() {
  const expired = await prisma.redemption.findMany({ where: { status: RedemptionStatus.PENDING, expiresAt: { lte: new Date() } }, select: { id: true, userId: true, productId: true, quantity: true, totalPrice: true } });
  let count = 0;
  for (const item of expired) {
    const processed = await auditedOperation(async (tx) => {
      const claimed = await tx.redemption.updateMany({ where: { id: item.id, status: RedemptionStatus.PENDING, expiresAt: { lte: new Date() } }, data: { status: RedemptionStatus.EXPIRED, pickupCode: null } });
      if (!claimed.count) return false;
      const user = await tx.user.update({ where: { id: item.userId }, data: { ecoCoinBalance: { increment: item.totalPrice } } });
      await tx.product.update({ where: { id: item.productId }, data: { quantity: { increment: item.quantity } } });
      await tx.ecoCoinTransaction.create({ data: { userId: item.userId, redemptionId: item.id, type: "REFUND", amount: item.totalPrice, description: "Estorno por troca expirada" } });
      await tx.storeAudit.create({
        data: {
          userId: item.userId, operation: "REFUND", amount: item.totalPrice,
          balanceBefore: user.ecoCoinBalance.sub(item.totalPrice), balanceAfter: user.ecoCoinBalance,
          redemptionId: item.id, productId: item.productId, quantity: item.quantity,
        },
      });
      return true;
    });
    if (processed) count++;
  }
  return count;
}

export async function listUserRedemptions(userId: string) {
  await expirePendingRedemptions();
  return prisma.redemption.findMany({
    where: { userId },
    select: { ...redemptionPublicSelect, product: { select: productPublicSelect } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listAdminRedemptions(adminId: string) {
  await expirePendingRedemptions();
  const redemptions = await prisma.redemption.findMany({
    where: { product: { adminId } },
    select: { ...redemptionPublicSelect, product: { select: productPublicSelect }, user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return redemptions.map(decryptPickupUser);
}

export async function validatePickupCode(adminId: string, code: string) {
  await expirePendingRedemptions();
  return auditedOperation(async (tx) => {
    const redemption = await tx.redemption.findUnique({
      where: { pickupCode: code, product: { admin: { active: true } }, user: { active: true } },
      include: { product: true },
    });
    if (!redemption || redemption.status !== RedemptionStatus.PENDING) throw new StoreError("Código inválido ou já utilizado", 404);
    if (redemption.product.adminId !== adminId) throw new StoreError("Código não pertence a esta loja", 403);
    if (redemption.expiresAt <= new Date()) throw new StoreError("Código expirado", 410);
    const result = await tx.redemption.updateMany({ where: { id: redemption.id, status: RedemptionStatus.PENDING, pickupCode: code }, data: { status: RedemptionStatus.COMPLETED, pickupCode: null, completedAt: new Date(), validatedById: adminId } });
    if (!result.count) throw new StoreError("Código inválido ou já utilizado", 409);
    const buyer = await tx.user.findUniqueOrThrow({
      where: { id: redemption.userId, active: true }, select: { ecoCoinBalance: true },
    });
    await tx.storeAudit.create({
      data: {
        actorId: adminId, userId: redemption.userId, operation: "PICKUP", amount: 0,
        balanceBefore: buyer.ecoCoinBalance, balanceAfter: buyer.ecoCoinBalance,
        redemptionId: redemption.id, productId: redemption.productId, quantity: redemption.quantity,
      },
    });
    const completed = await tx.redemption.findUnique({
      where: { id: redemption.id },
      select: { ...redemptionPublicSelect, product: { select: productPublicSelect }, user: { select: { name: true } } },
    });
    return completed ? decryptPickupUser(completed) : null;
  });
}
