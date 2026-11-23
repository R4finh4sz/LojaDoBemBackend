import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptedLocation, municipalProducts, sameLocation } from "@/services/Main/residents/municipality";
import { StoreError } from "./exceptions/StoreError";
import { InsufficientBalanceError } from "./exceptions/InsufficientBalanceError";
import { InsufficientStockError } from "./exceptions/InsufficientStockError";
import { auditedOperation } from "./store-audit.service";
import { productPublicSelect, sellerMunicipality } from "./store.service";

const cartLifetime = 24 * 60 * 60 * 1000;
const cartSelect = {
  id: true, buyerId: true, expiresAt: true,
  items: { orderBy: { productId: "asc" }, select: {
    productId: true, quantity: true, product: { select: productPublicSelect },
  } },
} satisfies Prisma.SalesCartSelect;

function activeCart(sellerId: string, id?: string) {
  return { id, sellerId, expiresAt: { gt: new Date() } };
}

async function requireCart(sellerId: string, id: string, tx: Prisma.TransactionClient = prisma) {
  const cart = await tx.salesCart.findFirst({ where: activeCart(sellerId, id), select: cartSelect });
  if (!cart) throw new StoreError("Carrinho não encontrado ou expirado", 404);
  return cart;
}

async function requireBuyer(tx: Prisma.TransactionClient, id: string, location: { city: string; state: string }) {
  const buyer = await tx.user.findUnique({
    where: { id, role: "USER", deletedAt: null, OR: [{ active: true }, { pendingActivation: true }] },
    select: { id: true, city: true, state: true, ecoCoinBalance: true },
  });
  if (!buyer || !sameLocation(decryptedLocation(buyer), location)) {
    throw new StoreError("Munícipe não encontrado neste município", 404);
  }
  return buyer;
}

export function createCart(sellerId: string, buyerId: string) {
  return auditedOperation(async (tx) => {
    const location = await sellerMunicipality(sellerId, tx);
    await requireBuyer(tx, buyerId, location);
    return tx.salesCart.create({
      data: { sellerId, buyerId, expiresAt: new Date(Date.now() + cartLifetime) },
      select: cartSelect,
    });
  });
}

export function listCarts(sellerId: string) {
  return prisma.salesCart.findMany({ where: activeCart(sellerId), select: cartSelect, orderBy: { expiresAt: "asc" } });
}

export function getCart(sellerId: string, id: string) {
  return requireCart(sellerId, id);
}

export async function deleteCart(sellerId: string, id: string) {
  const result = await prisma.salesCart.deleteMany({ where: activeCart(sellerId, id) });
  if (!result.count) throw new StoreError("Carrinho não encontrado ou expirado", 404);
}

export function purgeExpiredCarts() {
  return prisma.salesCart.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}

export function setCartItem(sellerId: string, id: string, identifier: { productId?: string; barcode?: string }, quantity: number) {
  return auditedOperation(async (tx) => {
    const cart = await requireCart(sellerId, id, tx);
    const location = await sellerMunicipality(sellerId, tx);
    const product = await tx.product.findFirst({
      where: { ...municipalProducts(location), id: identifier.productId, barcode: identifier.barcode },
      select: { id: true, active: true, quantity: true },
    });
    if (!product || (quantity > 0 && !product.active)) throw new StoreError("Produto não encontrado neste município", 404);
    const cartItem = { cartId: cart.id, productId: product.id };
    if (!quantity) {
      await tx.salesCartItem.deleteMany({ where: cartItem });
    } else {
      if (quantity > product.quantity) throw new InsufficientStockError();
      if (cart.items.length >= 100 && !cart.items.some((item) => item.productId === product.id)) {
        throw new StoreError("Limite de 100 produtos distintos por carrinho", 409);
      }
      await tx.salesCartItem.upsert({
        where: { cartId_productId: cartItem }, create: { ...cartItem, quantity }, update: { quantity },
      });
    }
    return requireCart(sellerId, id, tx);
  });
}

function saleReceipt(id: string, audit: {
  id: string; userId: string; redemptionId: string | null; productId: string | null;
  quantity: number | null; amount: Prisma.Decimal; balanceAfter: Prisma.Decimal;
}[]) {
  const balanceAfter = Prisma.Decimal.min(...audit.map((row) => row.balanceAfter));
  const total = audit.reduce((sum, row) => sum.sub(row.amount), new Prisma.Decimal(0));
  return {
    saleId: id, buyerId: audit[0].userId, total, ecoCoinBalance: balanceAfter,
    items: audit.map(({ id: auditId, redemptionId, productId, quantity, amount }) => ({
      auditId, redemptionId, productId, quantity, total: amount.negated(),
    })),
  };
}

export function checkoutCart(sellerId: string, id: string) {
  return auditedOperation(async (tx) => {
    const location = await sellerMunicipality(sellerId, tx);
    const existing = await tx.storeAudit.findMany({ where: { actorId: sellerId, cartId: id }, orderBy: { productId: "asc" } });
    if (existing.length) return saleReceipt(id, existing);
    const cart = await requireCart(sellerId, id, tx);
    if (!cart.items.length) throw new StoreError("Adicione pelo menos um item ao carrinho", 409);
    const buyer = await requireBuyer(tx, cart.buyerId, location);
    const total = cart.items.reduce((sum, item) => sum.add(item.product.price.mul(item.quantity)), new Prisma.Decimal(0));
    if (buyer.ecoCoinBalance.lt(total)) throw new InsufficientBalanceError();
    const now = new Date();
    const claimed = await tx.salesCart.deleteMany({ where: { id, sellerId, expiresAt: { gt: now } } });
    if (!claimed.count) throw new StoreError("Carrinho não encontrado ou expirado", 404);
    const debit = await tx.user.updateMany({
      where: { id: buyer.id, deletedAt: null, ecoCoinBalance: { gte: total } },
      data: { ecoCoinBalance: { decrement: total } },
    });
    if (!debit.count) throw new InsufficientBalanceError();
    let balance = buyer.ecoCoinBalance;
    const audit = [];
    for (const { productId, product, quantity } of cart.items) {
      if (!product.active || !sameLocation(product, location)) {
        throw new StoreError("Produto indisponível neste município", 409);
      }
      const stock = await tx.product.updateMany({
        where: { id: productId, active: true, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      });
      if (!stock.count) throw new InsufficientStockError();
      const itemTotal = product.price.mul(quantity);
      const sale = await tx.redemption.create({ data: {
        cartId: id, userId: buyer.id, productId, quantity, unitPrice: product.price, totalPrice: itemTotal,
        status: "COMPLETED", completedAt: now, expiresAt: now, validatedById: sellerId,
      } });
      const amount = itemTotal.negated();
      await tx.ecoCoinTransaction.create({ data: {
        userId: buyer.id, grantedById: sellerId, redemptionId: sale.id, type: "REDEMPTION", amount,
      } });
      const balanceBefore = balance;
      balance = balance.add(amount);
      audit.push(await tx.storeAudit.create({ data: {
        actorId: sellerId, userId: buyer.id, operation: "SALE", cartId: id,
        redemptionId: sale.id, productId, quantity, amount, balanceBefore, balanceAfter: balance,
      } }));
    }
    return saleReceipt(id, audit);
  });
}
