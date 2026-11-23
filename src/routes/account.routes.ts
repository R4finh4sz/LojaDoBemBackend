import { Router } from "express";
import { deleteAccountController, exportAccountController, listSessionHistoryController } from "@/controllers/Main/account/account.controller";
import { DeleteAccountDto } from "@/dto/account/account.dto";
import { authMiddleware } from "@/middlewares/auth.middleware";
import { validateDto } from "@/middlewares/validate-dto.middleware";

const router = Router();

router.use(authMiddleware);
router.get("/sessions", listSessionHistoryController);
router.get("/export", exportAccountController);
router.delete("/", validateDto(DeleteAccountDto), deleteAccountController);

export default router;
