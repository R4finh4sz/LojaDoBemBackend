import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { decryptedLocation, ensureMunicipality, normalizeMunicipality } from "@/services/Main/residents/municipality";

async function main() {
  let migrated = 0;
  for (;;) {
    const users = await prisma.user.findMany({
      where: { municipalityId: null, deletedAt: null, role: { not: "MASTER" } },
      select: { id: true, city: true, state: true, role: true, legacyEcoCoinBalance: true },
      orderBy: { id: "asc" },
      take: 100,
    });
    if (!users.length) break;

    for (const user of users) {
      const location = normalizeMunicipality(decryptedLocation(user));
      if (!location.city || !location.state) throw new Error(`Cidade ou UF ausente no cadastro ${user.id}`);
      const linked = await prisma.$transaction(async (tx) => {
        const municipality = await ensureMunicipality(tx, location);
        const result = await tx.user.updateMany({
          where: { id: user.id, municipalityId: null, deletedAt: null },
          data: { municipalityId: municipality.id },
        });
        if (!result.count) return false;
        if (user.role === "USER") {
          await tx.municipalWallet.create({
            data: { userId: user.id, municipalityId: municipality.id, balance: user.legacyEcoCoinBalance },
          });
        }
        return true;
      });
      if (linked) migrated++;
    }
  }

  await prisma.$executeRaw`
    UPDATE eco_coin_transactions AS entry
    SET "municipalityId" = COALESCE(
      (SELECT "municipalityId" FROM users WHERE id = entry."grantedById"),
      (SELECT "municipalityId" FROM users WHERE id = entry."userId")
    )
    WHERE entry."municipalityId" IS NULL
  `;
  if (await prisma.storeAudit.count({ where: { municipalityId: null } })) {
    // Attribute old entries without changing any previously recorded audit fields.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`ALTER TABLE store_audit DISABLE TRIGGER store_audit_append_only`;
      await tx.$executeRaw`
        UPDATE store_audit AS entry
        SET "municipalityId" = COALESCE(
          (SELECT "municipalityId" FROM users WHERE id = entry."actorId"),
          (SELECT "municipalityId" FROM users WHERE id = entry."userId")
        )
        WHERE entry."municipalityId" IS NULL
      `;
      await tx.$executeRaw`ALTER TABLE store_audit ENABLE TRIGGER store_audit_append_only`;
    });
  }
  const [transactions, audits] = await Promise.all([
    prisma.ecoCoinTransaction.count({ where: { municipalityId: null } }),
    prisma.storeAudit.count({ where: { municipalityId: null } }),
  ]);
  console.log(`Contas vinculadas: ${migrated}. Sem prefeitura identificada: ${transactions} movimentações e ${audits} registros de auditoria.`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
