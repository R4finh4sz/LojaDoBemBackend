import express from "express";
import cors from "cors";
import authRoutes from "@/routes/auth.routes";
import termsRoutes from "@/routes/terms.routes";
import storeRoutes from "@/routes/store.routes";
import accountRoutes from "@/routes/account.routes";
import residentsRoutes from "@/routes/residents.routes";
import masterRoutes from "@/routes/master.routes";
import { docsJsonRoutes, docsRoutes } from "@/routes/docs.routes";
import { authMiddleware } from "@/middlewares/auth.middleware";
import { rateLimitMiddleware } from "@/middlewares/security.middleware";

export const app = express();

app.use(cors());
app.use(rateLimitMiddleware);
app.post("/residents/pre-registrations", express.json({ limit: "3mb" }));
app.patch("/account/profile", express.json({ limit: "1mb" }));
app.use(express.json());

app.use("/docs", docsRoutes);
app.use("/docs.json", docsJsonRoutes);

app.use("/auth", authRoutes);
app.use("/terms", termsRoutes);
app.use("/store", storeRoutes);
app.use("/account", accountRoutes);
app.use("/residents", residentsRoutes);
app.use("/master", masterRoutes);

app.get("/me", authMiddleware, (req, res) => {
  res.json({
    user: {
      id: req.user!.id,
      role: req.user!.role,
      level: req.user!.level,
    },
  });
});
