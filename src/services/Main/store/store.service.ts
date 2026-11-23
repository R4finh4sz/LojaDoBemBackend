import { randomBytes } from "crypto";
import { Prisma, RedemptionStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSearchHash, decryptSensitiveData } from "@/services/Auth/data-protection/data-protection.service";
import { decryptedLocation, municipalProducts, sameLocation } from "@/services/Main/residents/municipality";
import { StoreError } from "./exceptions/StoreError";
import { InsufficientBalanceError } from "./exceptions/InsufficientBalanceError";
import { InsufficientStockError } from "./exceptions/InsufficientStockError";
import { auditedOperation, previousAudit } from "./store-audit.service";

export { StoreError } from "./exceptions/StoreError";

const REDEMPTION_DAYS = 5;
export const productPublicSelect = {
  id: true, name: true, description: true, photo: true, barcode: true, price: true,
  quantity: true, city: true, state: true, active: true, createdAt: true, updatedAt: true,
} satisfies Prisma.ProductSelect;
const redemptionPublicSelect = {
  id: true, cartId: true, quantity: true, unitPrice: true, totalPrice: true, pickupCode: true,
  status: true, expiresAt: true, completedAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.RedemptionSelect;

function decryptPickupUser<T extends { user?: { name: string } }>(value: T): T {
  if (value.user) value.user.name = decryptSensitiveData(value.user.name);
  return value;
}

export async function sellerMunicipality(sellerId: string, tx: Prisma.TransactionClient = prisma) {
  const seller = await tx.user.findUnique({
    where: { id: sellerId, role: Role.PrefeituraVendedor, active: true },
    select: { city: true, state: true },
  });
  if (!seller) throw new StoreError("Vendedor não encontrado", 404);
  const location = decryptedLocation(seller);
  return { city: location.city.trim().normalize("NFC").toLowerCase(), state: location.state.trim().toLowerCase() };
}

export async function createProduct(adminId: string, input: { name: string; description: string; photo: string; price: string; quantity: number; barcode?: string }) {
  try {
    return await auditedOperation(async (tx) => {
      const location = await sellerMunicipality(adminId, tx);
      return tx.product.create({ data: { ...input, adminId, ...location }, select: productPublicSelect });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new StoreError("Código de barras já cadastrado neste município", 409);
    }
    throw error;
  }
}

export async function listProductsForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { city: true, state: true } });
  if (!user) throw new StoreError("Usuário não encontrado", 404);
  const location = decryptedLocation(user);
  return prisma.product.findMany({
    where: { ...municipalProducts(location), active: true, quantity: { gt: 0 } },
    orderBy: { createdAt: "desc" },
    select: productPublicSelect,
  });
}

export async function listAdminProducts(adminId: string, filters: {
  page: number; search?: string; barcode?: string; stock?: "available" | "out";
}) {
  const location = await sellerMunicipality(adminId);
  const { page, barcode, stock } = filters;
  const limit = 9;
  const search = filters.search?.replace(/[\\%_]/g, "\\$&");
  const match = { contains: search, mode: "insensitive" as const };
  const where: Prisma.ProductWhereInput = { ...municipalProducts(location), barcode };
  if (search) where.OR = [{ name: match }, { description: match }];
  if (stock === "available") {
    where.active = true;
    where.quantity = { gt: 0 };
  }
  if (stock === "out") where.quantity = 0;

  const [total, products] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: productPublicSelect,
    }),
  ], { isolationLevel: "RepeatableRead" });
  return { products, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export function updateMunicipalStock(sellerId: string, productId: string, quantity: number, expectedQuantity: number) {
  return auditedOperation(async (tx) => {
    const location = await sellerMunicipality(sellerId, tx);
    const scope = { id: productId, ...municipalProducts(location), active: true };
    const updated = await tx.product.updateMany({
      where: { ...scope, quantity: expectedQuantity }, data: { quantity },
    });
    const product = await tx.product.findFirst({ where: scope, select: productPublicSelect });
    if (!product) throw new StoreError("Produto não encontrado neste município", 404);
    if (!updated.count) throw new StoreError("O estoque foi alterado. Consulte a quantidade atual", 409);
    return product;
  });
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
      tx.product.findUnique({ where: { id: productId } }),
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

export async function listAdminRedemptions(adminId: string, protocol?: string) {
  if (!protocol) await expirePendingRedemptions();
  const location = await sellerMunicipality(adminId);
  const query = {
    where: { product: municipalProducts(location) },
    select: { ...redemptionPublicSelect, product: { select: productPublicSelect }, user: { select: { name: true } } },
    orderBy: { createdAt: "desc" as const },
  };
  if (!protocol) return (await prisma.redemption.findMany(query)).map(decryptPickupUser);

  const sales = await prisma.redemption.findMany({
    ...query,
    where: { ...query.where, status: RedemptionStatus.COMPLETED, cartId: { not: null },
      OR: [{ protocol }, { cartId: protocol }] },
    select: { ...query.select, protocol: true, validatedBy: { select: { name: true } } },
  });
  return sales.map(({ validatedBy, ...sale }) => ({
    ...decryptPickupUser(sale),
    sellerName: validatedBy?.name ? decryptSensitiveData(validatedBy.name) : null,
  }));
}

export async function validatePickupCode(adminId: string, code: string) {
  await expirePendingRedemptions();
  return auditedOperation(async (tx) => {
    const location = await sellerMunicipality(adminId, tx);
    const redemption = await tx.redemption.findUnique({
      where: { pickupCode: code, user: { active: true } },
      include: { product: true },
    });
    if (!redemption || redemption.status !== RedemptionStatus.PENDING) throw new StoreError("Código inválido ou já utilizado", 404);
    if (!sameLocation(redemption.product, location)) throw new StoreError("Código não pertence a este município", 403);
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
