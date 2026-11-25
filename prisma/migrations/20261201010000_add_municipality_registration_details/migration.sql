ALTER TABLE "municipalities"
    ADD COLUMN "name" TEXT,
    ADD COLUMN "address" TEXT,
    ADD COLUMN "cep" TEXT,
    ADD COLUMN "cnpj" TEXT;

CREATE UNIQUE INDEX "municipalities_cnpj_key" ON "municipalities"("cnpj");
