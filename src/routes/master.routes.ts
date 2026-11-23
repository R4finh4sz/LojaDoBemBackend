import { Router } from "express";
import { Role } from "@prisma/client";
import { authMiddleware, requireRole } from "@/middlewares/auth.middleware";
import { getMasterDashboard } from "@/services/Main/master/dashboard.service";

const router = Router();

router.get("/dashboard", authMiddleware, requireRole(Role.MASTER), async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    return res.json(await getMasterDashboard());
  } catch (error) {
    console.error("Falha ao carregar o painel MASTER", error);
    return res.status(503).json({ message: "Painel temporariamente indisponível" });
  }
});

export default router;
