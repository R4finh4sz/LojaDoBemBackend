ALTER TABLE "sessions" ADD COLUMN "browser" TEXT,
ADD COLUMN "device" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "region" TEXT;

CREATE INDEX "sessions_userId_createdAt_id_idx" ON "sessions"("userId", "createdAt", "id");
