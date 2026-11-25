import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSensitiveData } from "@/services/Auth/data-protection/data-protection.service";
import { getProcessingHealth } from "./processing-health.service";

const activityLimit = 10;

async function distributedPoints() {
  const [result] = await prisma.$queryRaw<{
    periodStart: Date;
    total: Prisma.Decimal;
    currentMonth: Prisma.Decimal;
    previousMonth: Prisma.Decimal;
  }[]>`
    WITH local_month AS (
      SELECT date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AS starts
    ), bounds AS (
      SELECT (starts AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC' AS current_start,
             ((starts - interval '1 month') AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC' AS previous_start
      FROM local_month
    )
    SELECT current_start AS "periodStart",
           COALESCE(SUM(amount), 0) AS total,
           COALESCE(SUM(amount) FILTER (WHERE "createdAt" >= current_start), 0) AS "currentMonth",
           COALESCE(SUM(amount) FILTER (WHERE "createdAt" >= previous_start AND "createdAt" < current_start), 0) AS "previousMonth"
    FROM bounds LEFT JOIN eco_coin_transactions ON type = 'CREDIT'
    GROUP BY current_start
  `;
  const changePercent = result.previousMonth.isZero() ? null :
    result.currentMonth.minus(result.previousMonth).div(result.previousMonth).mul(100).toDecimalPlaces(2).toNumber();
  return { ...result, changePercent };
}

export async function getMasterDashboard() {
  const now = new Date();
  const [points, operators, events, activeClients] = await Promise.all([
    distributedPoints(),
    prisma.user.findMany({
      where: { role: { in: [Role.COOPERATIVA, Role.PrefeituraVendedor] }, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, role: true, name: true, createdAt: true },
      take: activityLimit,
    }),
    prisma.securityEvent.findMany({
      where: { kind: { in: ["RATE_LIMIT_BLOCK", "TWO_FACTOR_BLOCK"] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, kind: true, createdAt: true, blockedUntil: true },
      take: activityLimit,
    }),
    prisma.securityEvent.groupBy({
      by: ["clientKey"],
      where: { kind: "RATE_LIMIT_BLOCK", blockedUntil: { gt: now }, clientKey: { not: null } },
    }),
  ]);
  const totals = await prisma.securityEvent.groupBy({
    by: ["kind"], where: { createdAt: { gte: points.periodStart } }, _count: { _all: true },
  });
  const counts = new Map(totals.map((event) => [event.kind, event._count._all]));
  const registrations = operators.map(({ name, ...operator }) => ({ ...operator, name: decryptSensitiveData(name) }));
  const recentActivity = [
    ...registrations.map((operator) => ({ ...operator, kind: "OPERATOR_REGISTERED", status: "COMPLETED" })),
    ...events.map((event) => ({ ...event, status: "BLOCKED" })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, activityLimit);

  return {
    generatedAt: now,
    lastRegistration: registrations[0] ?? null,
    pointsDistributed: points,
    threats: { blocked: counts.get("TWO_FACTOR_BLOCK") ?? 0, periodStart: points.periodStart },
    rateLimit: { sanctions: counts.get("RATE_LIMIT_BLOCK") ?? 0, activeClients: activeClients.length, periodStart: points.periodStart },
    recentActivity,
    systemHealth: {
      api: { status: "UP", checkedAt: now, availabilityPercent: null },
      authentication: { status: "UP", checkedAt: now, availabilityPercent: null },
      processing: getProcessingHealth(now),
    },
  };
}
