BEGIN;

CREATE TABLE "store_sale_counters" (
    "day" TEXT PRIMARY KEY,
    "sequence" INTEGER NOT NULL
);

ALTER TABLE "redemptions" ADD COLUMN "protocol" TEXT;

WITH sales AS (
    SELECT "cartId", MIN(COALESCE("completedAt", "createdAt")) AS sold_at
    FROM "redemptions"
    WHERE "cartId" IS NOT NULL AND "status" = 'COMPLETED'
    GROUP BY "cartId"
), dated AS (
    SELECT *, to_char(sold_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'DDMMYYYY') AS day
    FROM sales
), numbered AS (
    SELECT *, row_number() OVER (PARTITION BY day ORDER BY sold_at, "cartId") AS sequence
    FROM dated
), counters AS (
    INSERT INTO "store_sale_counters" ("day", "sequence")
    SELECT day, MAX(sequence)::integer FROM numbered GROUP BY day
    RETURNING "day"
)
UPDATE "redemptions" AS line
SET "protocol" = numbered.day || lpad(numbered.sequence::text, GREATEST(2, length(numbered.sequence::text)), '0')
FROM numbered JOIN counters ON counters.day = numbered.day
WHERE line."cartId" = numbered."cartId";

CREATE INDEX "redemptions_protocol_idx" ON "redemptions"("protocol");

COMMIT;
