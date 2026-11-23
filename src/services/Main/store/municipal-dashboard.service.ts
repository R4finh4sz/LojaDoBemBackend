import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSensitiveData } from "@/services/Auth/data-protection/data-protection.service";
import { sellerMunicipality } from "./store.service";

type DashboardTotals = {
  ordersCollected: bigint;
  usersServed: bigint;
  pointsRedeemed: Prisma.Decimal;
  unitsCollected: bigint;
};

type OrderLine = {
  orderId: string;
  userId: string;
  userName: string;
  collectedAt: Date;
  productId: string;
  productName: string;
  quantity: number;
};

export async function getMunicipalDashboard(sellerId: string) {
  return prisma.$transaction(async (tx) => {
    const municipality = await sellerMunicipality(sellerId, tx);
    const uppercaseAccents = "ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝŸ";
    const lowercaseAccents = "áàâãäéèêëíìîïóòôõöúùûüçñýÿ";
    const collected = Prisma.sql`
      SELECT COALESCE(r."cartId", r.id) AS "orderId", r."userId", r."productId",
             r.quantity, r."totalPrice", COALESCE(r."completedAt", r."updatedAt") AS "collectedAt",
             p.name AS "productName"
      FROM redemptions r JOIN products p ON p.id = r."productId"
      WHERE r.status = 'COMPLETED'
        AND lower(translate(normalize(p.city), ${uppercaseAccents}, ${lowercaseAccents})) = ${municipality.city}
        AND lower(p.state) = lower(${municipality.state})
    `;

    const [totals] = await tx.$queryRaw<DashboardTotals[]>`
      WITH collected AS (${collected})
      SELECT count(DISTINCT "orderId") AS "ordersCollected",
             count(DISTINCT "userId") AS "usersServed",
             COALESCE(sum("totalPrice"), 0) AS "pointsRedeemed",
             COALESCE(sum(quantity), 0) AS "unitsCollected"
      FROM collected
    `;
    const lines = await tx.$queryRaw<OrderLine[]>`
      WITH collected AS (${collected}), recent AS (
        SELECT "orderId", max("collectedAt") AS "collectedAt"
        FROM collected GROUP BY "orderId"
        ORDER BY "collectedAt" DESC, "orderId" DESC LIMIT 10
      )
      SELECT c."orderId", c."userId", u.name AS "userName", recent."collectedAt",
             c."productId", c."productName", c.quantity
      FROM recent JOIN collected c USING ("orderId")
      JOIN users u ON u.id = c."userId"
      ORDER BY recent."collectedAt" DESC, c."orderId" DESC, c."productId" ASC
    `;
    const ranking = await tx.$queryRaw<{ productId: string; productName: string; units: bigint }[]>`
      WITH collected AS (${collected})
      SELECT "productId", "productName", sum(quantity) AS units
      FROM collected GROUP BY "productId", "productName"
      ORDER BY units DESC, "productId" ASC LIMIT 5
    `;
    const orders = new Map<string, {
      id: string;
      user: { id: string; name: string | null };
      collectedAt: Date;
      items: { productId: string; name: string; quantity: number }[];
    }>();
    for (const line of lines) {
      const order = orders.get(line.orderId) ?? {
        id: line.orderId,
        user: { id: line.userId, name: line.userName ? decryptSensitiveData(line.userName) : null },
        collectedAt: line.collectedAt,
        items: [],
      };
      order.items.push({ productId: line.productId, name: line.productName, quantity: line.quantity });
      orders.set(line.orderId, order);
    }
    const unitsCollected = Number(totals.unitsCollected);
    return {
      municipality,
      ordersCollected: Number(totals.ordersCollected),
      usersServed: Number(totals.usersServed),
      pointsRedeemed: totals.pointsRedeemed.toFixed(2),
      recentOrders: [...orders.values()],
      topItems: ranking.map(({ units, ...item }) => ({
        ...item, units: Number(units),
        sharePercent: unitsCollected ? Math.round(Number(units) * 10_000 / unitsCollected) / 100 : 0,
      })),
    };
  }, { isolationLevel: "RepeatableRead" });
}
