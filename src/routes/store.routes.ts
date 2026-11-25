import { Role } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { adminRedemptionsController, balanceController, createProductController, listAdminProductsController, listProductsController, redeemController, respond, userRedemptionsController, validatePickupController } from "@/controllers/Main/store/store.controller";
import { CreateProductDto, RedeemProductDto, ValidatePickupDto } from "@/dto/store/store.dto";
import { authMiddleware, requireRole } from "@/middlewares/auth.middleware";
import { validateDto } from "@/middlewares/validate-dto.middleware";
import { barcodePattern } from "@/dto/store/barcode-pattern";
import { moneyPattern } from "@/dto/store/money-pattern";
import { checkoutCart, createCart, deleteCart, getCart, listCarts, setCartItem } from "@/services/Main/store/sales-cart.service";
import { exportMunicipalStore } from "@/services/Main/store/store-export.service";
import { updateMunicipalProductStatus, updateMunicipalStock } from "@/services/Main/store/store.service";
import { getMunicipalDashboard } from "@/services/Main/store/municipal-dashboard.service";

const router = Router();
router.use(authMiddleware);

router.get("/products", requireRole(Role.USER), listProductsController);
router.get("/balance", requireRole(Role.USER), balanceController);
router.post("/redemptions", requireRole(Role.USER), validateDto(RedeemProductDto), redeemController);
router.get("/redemptions", requireRole(Role.USER), userRedemptionsController);

const seller = requireRole(Role.PrefeituraVendedor);
router.get("/admin/dashboard", seller, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return respond(res, () => getMunicipalDashboard(req.user!.id));
});
const uuid = z.string().uuid();
const cartItemInput = z.object({
  productId: uuid.optional(),
  barcode: z.string().trim().regex(barcodePattern).optional(),
  quantity: z.number().int().min(0).max(2_147_483_647),
}).strict().refine(({ productId, barcode }) => Boolean(productId) !== Boolean(barcode), {
  message: "Informe o ID do item ou o código de barras",
});

router.get("/admin/export.xlsx", seller, (req, res) => respond(res, async () => {
  const workbook = await exportMunicipalStore(req.user!.id);
  res.attachment("loja-municipal.xlsx").set("Cache-Control", "no-store").send(workbook);
}));
router.get("/admin/carts", seller, (req, res) => respond(res, async () => ({ carts: await listCarts(req.user!.id) })));
router.post("/admin/carts", seller, (req, res) => respond(res, async () => {
  const { buyerId } = z.object({ buyerId: uuid }).strict().parse(req.body);
  return createCart(req.user!.id, buyerId);
}, 201));
router.get("/admin/carts/:id", seller, (req, res) => respond(res, () => getCart(req.user!.id, uuid.parse(req.params.id))));
router.delete("/admin/carts/:id", seller, (req, res) => respond(res, () => deleteCart(req.user!.id, uuid.parse(req.params.id)), 204));
router.put("/admin/carts/:id/items", seller, (req, res) => respond(res, () => {
  const { quantity, ...identifier } = cartItemInput.parse(req.body);
  return setCartItem(req.user!.id, uuid.parse(req.params.id), identifier, quantity);
}));
router.post("/admin/carts/:id/checkout", seller, (req, res) => respond(res, () => {
  const { expectedTotal } = z.object({ expectedTotal: z.string().regex(/^\d{1,24}\.\d{2}$/) }).strict().parse(req.body);
  return checkoutCart(req.user!.id, uuid.parse(req.params.id), expectedTotal);
}, 201));

router.post("/admin/products", seller, validateDto(CreateProductDto), createProductController);
router.get("/admin/products", seller, listAdminProductsController);
router.patch("/admin/products/:id/stock", seller, (req, res) => respond(res, async () => {
  const count = z.number().int().min(0).max(2_147_483_647);
  const priceValue = z.string().trim().regex(moneyPattern, "Informe um valor com até duas casas decimais").transform((value) => value.replace(",", "."));
  const input = z.object({ quantity: count, expectedQuantity: count, price: priceValue.optional(), expectedPrice: priceValue.optional() })
    .strict().refine(({ price, expectedPrice }) => (price === undefined) === (expectedPrice === undefined), {
      message: "Informe o preço atual e o novo preço juntos",
      path: ["price"],
    }).parse(req.body);
  return { product: await updateMunicipalStock(req.user!.id, uuid.parse(req.params.id), input) };
}));
router.patch("/admin/products/:id/status", seller, (req, res) => respond(res, async () => {
  const { active } = z.object({ active: z.boolean() }).strict().parse(req.body);
  await updateMunicipalProductStatus(req.user!.id, uuid.parse(req.params.id), active);
}, 204));
router.get("/admin/redemptions", requireRole(Role.PrefeituraVendedor), adminRedemptionsController);
router.post("/admin/redemptions/validate", requireRole(Role.PrefeituraVendedor), validateDto(ValidatePickupDto), validatePickupController);

export default router;
