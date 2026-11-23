import "dotenv/config";
import "./register-paths";
import { app } from "@/app";
import { expirePendingRedemptions } from "@/services/Main/store/store.service";
import { purgeExpiredCarts } from "@/services/Main/store/sales-cart.service";
import { runTrackedJob } from "@/services/Main/master/processing-health.service";
import { ensureConfiguredMaster, MasterBootstrapError } from "@/services/Main/master/master-bootstrap.service";
import { prisma } from "@/lib/prisma";

const PORT = process.env.PORT || 3000;

const cleanupRedemptions = () => void runTrackedJob("redemptions", expirePendingRedemptions);
const cleanupCarts = () => void runTrackedJob("carts", purgeExpiredCarts);

async function start() {
  await ensureConfiguredMaster();
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
  setInterval(cleanupRedemptions, 60 * 60_000).unref();
  setInterval(cleanupCarts, 60_000).unref();
  cleanupRedemptions();
  cleanupCarts();
}

start().catch(async (error: unknown) => {
  console.error("Falha na inicialização:", error instanceof MasterBootstrapError ? error.message : "Não foi possível preparar a conta MASTER no banco");
  process.exitCode = 1;
  await prisma.$disconnect();
});
