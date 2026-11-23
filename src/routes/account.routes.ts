import { Router } from "express";
import { changeAccountPassword, requestAccountPasswordCode, verifyAccountPasswordCode } from "@/controllers/Main/account/account-password.controller";
import { deleteAccountController, exportAccountController, getAccountProfileController, listSessionHistoryController, updateAccountProfileController, updateAccountTwoFactorController } from "@/controllers/Main/account/account.controller";
import { DeleteAccountDto } from "@/dto/account/account.dto";
import { authMiddleware } from "@/middlewares/auth.middleware";
import { validateDto } from "@/middlewares/validate-dto.middleware";

const router = Router();

router.use(authMiddleware);
router.get("/sessions", listSessionHistoryController);
router.post("/password/code", requestAccountPasswordCode);
router.post("/password/verify-code", verifyAccountPasswordCode);
router.post("/password/change", changeAccountPassword);
router.get("/profile", getAccountProfileController);
router.patch("/profile", updateAccountProfileController);
router.patch("/two-factor", updateAccountTwoFactorController);
router.get("/export", exportAccountController);
router.delete("/", validateDto(DeleteAccountDto), deleteAccountController);

export default router;
