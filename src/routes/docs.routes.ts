import express, { Router } from "express";
import { Role } from "@prisma/client";
import swaggerUi from "swagger-ui-express";
import { authMiddleware, requireRole } from "@/middlewares/auth.middleware";
import { swaggerSpec } from "@/swagger";

const cookieName = "swagger_session";
export const docsRoutes = Router();
export const docsJsonRoutes = Router();

function noStore(_req: express.Request, res: express.Response, next: express.NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

const masterOnly = requireRole(Role.MASTER);
docsRoutes.use(noStore);
docsRoutes.get("/login", (_req, res) => {
  res.setHeader("Content-Security-Policy", "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  res.type("html").send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Acesso ao Swagger</title></head>
<body><main><h1>Acesso ao Swagger</h1>
<form action="/docs/login" method="post">
  <label for="token">Token da sessão MASTER</label>
  <input id="token" name="token" type="password" autocomplete="off" required maxlength="3500">
  <button type="submit">Entrar</button>
</form></main></body></html>`);
});

docsRoutes.post("/login", express.urlencoded({ extended: false, limit: "8kb" }), (req, res, next) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token) || token.length > 3500) {
    return res.status(400).json({ message: "Informe um token válido" });
  }
  req.headers.authorization = `Bearer ${token}`;
  next();
}, authMiddleware, masterOnly, (req, res) => {
  res.cookie(cookieName, req.headers.authorization!.slice("Bearer ".length), {
    httpOnly: true, sameSite: "strict", secure: req.secure || process.env.NODE_ENV === "production", path: "/docs",
  });
  res.redirect(303, "/docs/");
});

docsRoutes.use((req, _res, next) => {
  if (!req.headers.authorization) {
    const cookie = req.headers.cookie?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${cookieName}=`));
    if (cookie) req.headers.authorization = `Bearer ${cookie.slice(cookieName.length + 1)}`;
  }
  next();
}, authMiddleware, masterOnly);
docsRoutes.use(...swaggerUi.serve, swaggerUi.setup(swaggerSpec, { swaggerOptions: { persistAuthorization: false } }));

docsJsonRoutes.get("/", noStore, authMiddleware, masterOnly, (_req, res) => res.json(swaggerSpec));
