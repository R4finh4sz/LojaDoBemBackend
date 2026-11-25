import { Router } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { decryptSensitiveData } from "@/services/Auth/data-protection/data-protection.service";
import { authMiddleware, requireRole } from "@/middlewares/auth.middleware";
import { getMasterDashboard } from "@/services/Main/master/dashboard.service";
import { normalizeMunicipality, resolveMunicipality } from "@/services/Main/residents/municipality";
import { AccountError, eraseAccount } from "@/services/Main/account/account.service";
import { StoreError } from "@/services/Main/store/exceptions/StoreError";
import { cnpjSchema } from "@/validation/cnpj.validation";

const router = Router();
const municipalityInput = z.object({
  name: z.string().trim().min(2).max(150),
  address: z.string().trim().min(1).max(255),
  cep: z.string().trim().regex(/^\d{5}-?\d{3}$/).transform((cep) => cep.replace("-", "")),
  cnpj: cnpjSchema,
}).strict();

router.get("/operators", authMiddleware, requireRole(Role.MASTER), async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const role = z.enum([Role.PrefeituraVendedor, Role.COOPERATIVA]).safeParse(req.query.role);
  if (!role.success) return res.status(400).json({ message: "Informe um perfil de operador válido" });
  try {
    const records = await prisma.user.findMany({
      where: { role: role.data, deletedAt: null },
      select: { id: true, name: true, email: true, municipality: { select: { name: true, city: true, state: true } } },
    });
    const operators = records.map(({ id, name, email, municipality }) => ({
      id, name: decryptSensitiveData(name), email: decryptSensitiveData(email), municipality,
    })).sort((first, second) => first.name.localeCompare(second.name, "pt-BR") || first.id.localeCompare(second.id));
    return res.json({ operators });
  } catch (error) {
    console.error("Falha ao listar operadores", error);
    return res.status(500).json({ message: "Não foi possível carregar os operadores." });
  }
});

router.get("/municipalities", authMiddleware, requireRole(Role.MASTER), async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const municipalities = await prisma.municipality.findMany({
      where: { name: { not: null } },
      select: { id: true, name: true, address: true, cep: true, cnpj: true, city: true, state: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return res.json({ municipalities });
  } catch (error) {
    console.error("Falha ao listar prefeituras", error);
    return res.status(500).json({ message: "Não foi possível carregar as prefeituras." });
  }
});

router.post("/municipalities", authMiddleware, requireRole(Role.MASTER), async (req, res) => {
  const parsed = municipalityInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Dados da prefeitura inválidos", errors: parsed.error.flatten().fieldErrors });
  }

  try {
    const location = normalizeMunicipality(await resolveMunicipality(parsed.data.cep));
    const result = await prisma.$transaction(async (tx) => {
      const completed = await tx.municipality.updateMany({
        where: { ...location, name: null },
        data: parsed.data,
      });
      if (completed.count) {
        const municipality = await tx.municipality.findUniqueOrThrow({ where: { city_state: location } });
        return { status: 200, municipality };
      }
      const municipality = await tx.municipality.create({ data: { ...location, ...parsed.data } });
      return { status: 201, municipality };
    });
    return res.status(result.status).json(result.municipality);
  } catch (error) {
    if (error instanceof StoreError) return res.status(error.status).json({ message: error.message });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      if (Array.isArray(error.meta?.target) && error.meta.target.includes("cnpj")) {
        return res.status(409).json({ message: "Já existe uma prefeitura cadastrada com este CNPJ" });
      }
      return res.status(409).json({ message: "Já existe uma prefeitura cadastrada para este município" });
    }
    console.error("Falha ao cadastrar prefeitura", error);
    return res.status(500).json({ message: "Erro interno ao cadastrar prefeitura" });
  }
});

router.delete("/operators/:id", authMiddleware, requireRole(Role.MASTER), async (req, res) => {
  const input = z.object({
    id: z.string().uuid(),
    role: z.enum([Role.PrefeituraVendedor, Role.COOPERATIVA]),
  }).safeParse({ id: req.params.id, role: req.query.role });
  if (!input.success) return res.status(400).json({ message: "Informe um operador válido" });

  try {
    await eraseAccount(input.data.id, false, undefined, undefined, input.data.role);
    return res.status(204).end();
  } catch (error) {
    if (error instanceof AccountError || error instanceof StoreError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Falha ao excluir operador", error instanceof Error ? error.name : "Erro desconhecido");
    return res.status(500).json({ message: "Não foi possível excluir o operador." });
  }
});

router.delete("/municipalities/:id", authMiddleware, requireRole(Role.MASTER), async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ message: "Informe uma prefeitura válida" });

  try {
    const deleted = await prisma.municipality.deleteMany({ where: { id: id.data, name: { not: null } } });
    if (!deleted.count) return res.status(404).json({ message: "Prefeitura não encontrada" });
    return res.status(204).end();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return res.status(409).json({ message: "A prefeitura tem registros vinculados e não pode ser excluída." });
    }
    console.error("Falha ao excluir prefeitura", error instanceof Error ? error.name : "Erro desconhecido");
    return res.status(500).json({ message: "Não foi possível excluir a prefeitura." });
  }
});

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
