BEGIN;

CREATE TABLE "municipalities" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    CONSTRAINT "municipalities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "municipalities_city_state_key" ON "municipalities"("city", "state");

ALTER TABLE "users" ADD COLUMN "municipalityId" TEXT;
CREATE INDEX "users_municipalityId_idx" ON "users"("municipalityId");
ALTER TABLE "users" ADD CONSTRAINT "users_municipalityId_fkey"
    FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "municipal_wallets" (
    "id" TEXT NOT NULL,
    "municipalityId" TEXT NOT NULL,
    "userId" TEXT,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT "municipal_wallets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "municipal_wallets_balance_nonnegative" CHECK ("balance" >= 0),
    CONSTRAINT "municipal_wallets_municipalityId_fkey"
        FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "municipal_wallets_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "municipal_wallets_userId_key" ON "municipal_wallets"("userId");
CREATE INDEX "municipal_wallets_municipalityId_idx" ON "municipal_wallets"("municipalityId");

ALTER TABLE "products" ADD COLUMN "municipalityId" TEXT;
CREATE TEMP TABLE "product_municipalities" ON COMMIT DROP AS
SELECT id,
       lower(translate(normalize(btrim(city)), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝŸ', 'áàâãäéèêëíìîïóòôõöúùûüçñýÿ') COLLATE "C") AS city,
       lower(normalize(btrim(state)) COLLATE "C") AS state
FROM "products";

INSERT INTO "municipalities" ("id", "city", "state")
SELECT gen_random_uuid()::text, location.city, location.state
FROM (SELECT DISTINCT city, state FROM "product_municipalities") AS location;

UPDATE "products" AS p
SET "municipalityId" = m.id
FROM "product_municipalities" AS location
JOIN "municipalities" AS m USING (city, state)
WHERE p.id = location.id;

ALTER TABLE "products" ALTER COLUMN "municipalityId" SET NOT NULL;
ALTER TABLE "products" DROP CONSTRAINT "products_adminId_fkey", ALTER COLUMN "adminId" DROP NOT NULL;
ALTER TABLE "products" ADD CONSTRAINT "products_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_municipalityId_fkey"
    FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "products_city_state_active_idx";
DROP INDEX "products_city_state_barcode_key";
CREATE INDEX "products_municipalityId_active_idx" ON "products"("municipalityId", "active");
CREATE UNIQUE INDEX "products_municipalityId_barcode_key" ON "products"("municipalityId", "barcode");

ALTER TABLE "eco_coin_transactions" ADD COLUMN "municipalityId" TEXT;
ALTER TABLE "eco_coin_transactions" DROP CONSTRAINT "eco_coin_transactions_userId_fkey", ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "eco_coin_transactions" ADD CONSTRAINT "eco_coin_transactions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "eco_coin_transactions" ADD CONSTRAINT "eco_coin_transactions_municipalityId_fkey"
    FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "eco_coin_transactions_municipalityId_idx" ON "eco_coin_transactions"("municipalityId");

UPDATE "eco_coin_transactions" AS t
SET "municipalityId" = p."municipalityId"
FROM "redemptions" AS r
JOIN "products" AS p ON p.id = r."productId"
WHERE t."redemptionId" = r.id;

ALTER TABLE "store_audit" ADD COLUMN "municipalityId" TEXT;
ALTER TABLE "store_audit" ADD CONSTRAINT "store_audit_municipalityId_fkey"
    FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "store_audit_municipalityId_createdAt_idx" ON "store_audit"("municipalityId", "createdAt");

ALTER TABLE "store_audit" DISABLE TRIGGER "store_audit_append_only";
UPDATE "store_audit" AS audit
SET "municipalityId" = p."municipalityId"
FROM "products" AS p
WHERE p.id = audit."productId";
ALTER TABLE "store_audit" ENABLE TRIGGER "store_audit_append_only";

COMMIT;
