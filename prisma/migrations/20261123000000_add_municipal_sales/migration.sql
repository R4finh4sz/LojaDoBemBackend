-- CPF and e-mail uniqueness is enforced by the normalized search hashes.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_cpf_key";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_key";
DROP INDEX IF EXISTS "users_cpf_key";
DROP INDEX IF EXISTS "users_email_key";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "addressNumber" TEXT,
ADD COLUMN     "authorizationPdf" TEXT,
ADD COLUMN     "cnpj" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "pendingActivation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preRegisteredById" TEXT;

-- CreateTable
CREATE TABLE "resident_activations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resident_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_audit" (
    "id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "actorId" TEXT,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceBefore" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "redemptionId" TEXT,
    "productId" TEXT,
    "quantity" INTEGER,
    "requestKey" TEXT,
    "requestHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resident_activations_userId_key" ON "resident_activations"("userId");

-- CreateIndex
CREATE INDEX "store_audit_userId_createdAt_idx" ON "store_audit"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "store_audit_actorId_operation_requestKey_key" ON "store_audit"("actorId", "operation", "requestKey");

-- AddForeignKey
ALTER TABLE "resident_activations" ADD CONSTRAINT "resident_activations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "users" ADD CONSTRAINT "users_ecocoin_nonnegative" CHECK ("ecoCoinBalance" >= 0) NOT VALID;

CREATE FUNCTION reject_store_audit_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Store audit is append-only';
END;
$$;

CREATE TRIGGER "store_audit_append_only"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "store_audit"
FOR EACH STATEMENT EXECUTE FUNCTION reject_store_audit_changes();
