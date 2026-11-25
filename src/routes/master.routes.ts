import { Router, type Request } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authMiddleware, requireRole } from "@/middlewares/auth.middleware";
import { decryptSensitiveData } from "@/services/Auth/data-protection/data-protection.service";
import { AccountError, eraseAccount } from "@/services/Main/account/account.service";
import { getMasterDashboard } from "@/services/Main/master/dashboard.service";
import { decryptedLocation, resolveMunicipality } from "@/services/Main/residents/municipality";
import { StoreError } from "@/services/Main/store/exceptions/StoreError";
import { cnpjSchema } from "@/validation/cnpj.validation";

const router = Router();
const idSchema = z.string().uuid();
const operatorRole = z.enum([Role.PrefeituraVendedor, Role.COOPERATIVA]);
const municipalityInput = z.object({
  name: z.string().trim().min(2).max(150),
  address: z.string().trim().min(1).max(255),
  cep: z.string().regex(/^\d{8}$/),
  cnpj: cnpjSchema,
});

router.use(authMiddleware, requireRole(Role.MASTER), (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

router.get("/dashboard", async (_req, res) => {
  try {
    return res.json(await getMasterDashboard());
  } catch (error) {
    console.error("Falha ao carregar o painel MASTER", error);
    return res.status(503).json({ message: "Painel temporariamente indisponível" });
  }
});

function directoryRoute(status: number, action: (req: Request) => Promise<unknown>) {
  return async (req: Request, res: import("express").Response) => {
    try {
      const result = await action(req);
      return status === 204 ? res.status(status).end() : res.status(status).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.flatten().fieldErrors });
      }
      if (error instanceof StoreError || error instanceof AccountError) {
        return res.status(error.status).json({ message: error.message });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") return res.status(409).json({ message: "Já existe uma prefeitura com este CNPJ" });
        if (error.code === "P2025") return res.status(404).json({ message: "Prefeitura não encontrada" });
      }
      console.error("Falha ao processar cadastro do painel MASTER", error instanceof Error ? error.name : "Erro desconhecido");
      return res.status(500).json({ message: "Erro interno" });
    }
  };
}

router.get("/municipalities", directoryRoute(200, async () => {
  const municipalities = await prisma.municipality.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }] });
  return { municipalities };
}));

router.post("/municipalities", directoryRoute(201, async (req) => {
  const input = municipalityInput.parse(req.body);
  const location = await resolveMunicipality(input.cep);
  return prisma.municipality.create({ data: { ...input, ...location } });
}));

router.delete("/municipalities/:id", directoryRoute(204, async (req) => {
  await prisma.municipality.delete({ where: { id: idSchema.parse(req.params.id) } });
}));

router.get("/operators", directoryRoute(200, async (req) => {
  const role = operatorRole.parse(req.query.role);
  const rows = await prisma.user.findMany({
    where: { role, deletedAt: null },
    select: { id: true, name: true, email: true, city: true, state: true },
  });
  const operators = rows.map((row) => {
    const { city, state } = decryptedLocation(row);
    return {
      id: row.id,
      name: decryptSensitiveData(row.name),
      email: decryptSensitiveData(row.email),
      municipality: city && state ? { name: null, city, state } : null,
    };
  }).sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
  return { operators };
}));

router.delete("/operators/:id", directoryRoute(204, async (req) => {
  await eraseAccount(idSchema.parse(req.params.id), false, undefined, operatorRole.parse(req.query.role));
}));

export default router;
