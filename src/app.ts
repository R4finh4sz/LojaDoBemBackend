import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import authRoutes from "@/routes/auth.routes";
import termsRoutes from "@/routes/terms.routes";
import storeRoutes from "@/routes/store.routes";
import accountRoutes from "@/routes/account.routes";
import residentsRoutes from "@/routes/residents.routes";
import { authMiddleware } from "@/middlewares/auth.middleware";
import { rateLimitMiddleware } from "@/middlewares/security.middleware";
import { swaggerSpec } from "@/swagger";

export const app = express();

app.use(cors());
app.use(rateLimitMiddleware);
app.post("/residents/pre-registrations", express.json({ limit: "3mb" }));
app.use(express.json());

app.use("/docs", ...swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/docs.json", (_req, res) => {
  res.json(swaggerSpec);
});

app.use("/auth", authRoutes);
app.use("/terms", termsRoutes);
app.use("/store", storeRoutes);
app.use("/account", accountRoutes);
app.use("/residents", residentsRoutes);

app.get("/me", authMiddleware, (req, res) => {
  res.json({
    user: {
      id: req.user!.id,
      role: req.user!.role,
      level: req.user!.level,
    },
  });
});
