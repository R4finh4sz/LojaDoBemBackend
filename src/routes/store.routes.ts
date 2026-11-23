import { Role } from "@prisma/client";
import { Router } from "express";
import { adminRedemptionsController, balanceController, createProductController, listAdminProductsController, listProductsController, redeemController, userRedemptionsController, validatePickupController } from "@/controllers/Main/store/store.controller";
import { CreateProductDto, RedeemProductDto, ValidatePickupDto } from "@/dto/store/store.dto";
import { authMiddleware, requireRole } from "@/middlewares/auth.middleware";
import { validateDto } from "@/middlewares/validate-dto.middleware";

const router = Router();
router.use(authMiddleware);

router.get("/products", requireRole(Role.USER), listProductsController);
router.get("/balance", requireRole(Role.USER), balanceController);
router.post("/redemptions", requireRole(Role.USER), validateDto(RedeemProductDto), redeemController);
router.get("/redemptions", requireRole(Role.USER), userRedemptionsController);

router.post("/admin/products", requireRole(Role.PrefeituraVendedor), validateDto(CreateProductDto), createProductController);
router.get("/admin/products", requireRole(Role.PrefeituraVendedor), listAdminProductsController);
router.get("/admin/redemptions", requireRole(Role.PrefeituraVendedor), adminRedemptionsController);
router.post("/admin/redemptions/validate", requireRole(Role.PrefeituraVendedor), validateDto(ValidatePickupDto), validatePickupController);

export default router;
