import "dotenv/config";
import "./register-paths";
import { app } from "@/app";
import { expirePendingRedemptions } from "@/services/Main/store/store.service";
import { purgeExpiredCarts } from "@/services/Main/store/sales-cart.service";
import { runTrackedJob } from "@/services/Main/master/processing-health.service";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

const cleanupRedemptions = () => void runTrackedJob("redemptions", expirePendingRedemptions);
const cleanupCarts = () => void runTrackedJob("carts", purgeExpiredCarts);
setInterval(cleanupRedemptions, 60 * 60_000).unref();
setInterval(cleanupCarts, 60_000).unref();
cleanupRedemptions();
cleanupCarts();
