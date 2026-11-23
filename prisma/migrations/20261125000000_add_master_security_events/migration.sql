-- CreateEnum
CREATE TYPE "SecurityEventKind" AS ENUM ('RATE_LIMIT_BLOCK', 'TWO_FACTOR_BLOCK');

-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "kind" "SecurityEventKind" NOT NULL,
    "clientKey" TEXT,
    "blockedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_events_kind_createdAt_idx" ON "security_events"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "security_events_kind_blockedUntil_clientKey_idx" ON "security_events"("kind", "blockedUntil", "clientKey");

-- CreateIndex
CREATE INDEX "security_events_createdAt_idx" ON "security_events"("createdAt");
