CREATE TABLE "municipalities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "cep" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,

    CONSTRAINT "municipalities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "municipalities_cnpj_key" ON "municipalities"("cnpj");
