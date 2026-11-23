import "dotenv/config";
import "./register-paths";
import { app } from "@/app";
import { expirePendingRedemptions } from "@/services/Main/store/store.service";
import { purgeExpiredCarts } from "@/services/Main/store/sales-cart.service";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

const expirationTimer = setInterval(() => {
  expirePendingRedemptions().catch((error) => console.error("Erro ao expirar trocas:", error));
}, 60 * 60 * 1000);
expirationTimer.unref();
expirePendingRedemptions().catch((error) => console.error("Erro ao expirar trocas na inicialização:", error));

function cleanupCarts() {
  purgeExpiredCarts().catch((error) => console.error("Erro ao limpar carrinhos expirados:", error));
}
setInterval(cleanupCarts, 60_000).unref();
cleanupCarts();
