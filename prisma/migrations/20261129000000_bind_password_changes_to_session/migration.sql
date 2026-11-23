ALTER TABLE "password_reset_challenges" ADD COLUMN "sessionId" TEXT;
CREATE INDEX "password_reset_challenges_sessionId_idx" ON "password_reset_challenges"("sessionId");
