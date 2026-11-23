import "dotenv/config";
import "./register-paths";
import { app } from "@/app";
import { expirePendingRedemptions } from "@/services/Main/store/store.service";
import { purgeExpiredCarts } from "@/services/Main/store/sales-cart.service";
import { runTrackedJob } from "@/services/Main/master/processing-health.service";
import { ensureConfiguredMaster, hasActiveMaster, MasterBootstrapError } from "@/services/Main/master/master-bootstrap.service";
import { prisma } from "@/lib/prisma";

const PORT = process.env.PORT || 3000;

const cleanupRedemptions = () => void runTrackedJob("redemptions", expirePendingRedemptions);
const cleanupCarts = () => void runTrackedJob("carts", purgeExpiredCarts);

async function start() {
  await ensureConfiguredMaster();
  const server = app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
  const redemptionTimer = setInterval(cleanupRedemptions, 60 * 60_000).unref();
  const cartTimer = setInterval(cleanupCarts, 60_000).unref();
  let checking = false;
  let stopping = false;

  function stopWithoutMaster() {
    if (stopping) return;
    stopping = true;
    process.exitCode = 1;
    console.error("A conta MASTER original deixou de estar ativa. Encerrando a API");
    clearInterval(redemptionTimer);
    clearInterval(cartTimer);
    clearInterval(masterTimer);
    setTimeout(() => process.exit(1), 5_000).unref();
    server.close(() => void prisma.$disconnect().catch(() => undefined));
  }

  const masterTimer = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      if (!(await hasActiveMaster())) stopWithoutMaster();
    } catch {
      console.error("Falha ao verificar a conta MASTER no banco");
    } finally {
      checking = false;
    }
  }, 5_000).unref();
  app.once("masterDeleted", stopWithoutMaster);
  cleanupRedemptions();
  cleanupCarts();
}

start().catch(async (error: unknown) => {
  console.error("Falha na inicialização:", error instanceof MasterBootstrapError ? error.message : "Não foi possível preparar a conta MASTER no banco");
  process.exitCode = 1;
  await prisma.$disconnect();
});
