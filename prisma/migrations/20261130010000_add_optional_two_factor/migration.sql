ALTER TABLE "users" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ALTER COLUMN "twoFactorEnabled" SET DEFAULT false;
