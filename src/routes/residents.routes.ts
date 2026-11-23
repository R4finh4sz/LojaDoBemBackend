import { Router, Request, Response } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authMiddleware, requireRole } from "@/middlewares/auth.middleware";
import { ageInYears, registerFields } from "@/validation/register.validation";
import { createSearchHash } from "@/services/Auth/data-protection/data-protection.service";
import { UserAlreadyExistsError } from "@/services/Auth/register/register.service";
import { activateResident, confirmActivation, createResident, findResident, startActivation } from "@/services/Main/residents/residents.service";
import { AccountError, eraseAccount } from "@/services/Main/account/account.service";
import { creditResident } from "@/services/Main/store/municipal-credit.service";
import { StoreError } from "@/services/Main/store/exceptions/StoreError";

const router = Router();
const cpf = registerFields.shape.cpf;
const id = z.string().uuid();
const passwordFields = registerFields.pick({ phone: true, password: true, passwordConfirmation: true, termsAccepted: true });
const residentFields = registerFields.pick({ cpf: true, name: true, birthDate: true, cep: true, address: true, email: true }).extend({
  addressNumber: z.string().trim().min(1).max(30),
  authorizationPdf: z.string().max(2_796_204).regex(/^[A-Za-z0-9+/]+={0,2}$/).refine((value) => {
    const pdf = Buffer.from(value, "base64");
    return pdf.length <= 2 * 1024 * 1024 && pdf.toString("base64") === value &&
      pdf.subarray(0, 5).toString() === "%PDF-" && pdf.subarray(-1024).includes(Buffer.from("%%EOF"));
  }, "Informe um PDF válido de até 2 MiB em Base64").optional(),
}).refine(({ birthDate }) => {
  const age = ageInYears(birthDate);
  return age >= 18 && age <= 100;
}, { message: "Idade deve ser de 18 a 100 anos", path: ["birthDate"] });

function requestKey(req: Request) {
  return createSearchHash(z.string().trim().min(1).max(128).parse(req.get("Idempotency-Key")));
}

function handle(action: (req: Request) => Promise<unknown>, status = 200) {
  return async (req: Request, res: Response) => {
    try {
      const result = await action(req);
      if (status === 204) return res.sendStatus(status);
      return res.status(status).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ details: error.flatten() });
      if (error instanceof StoreError || error instanceof AccountError) return res.status(error.status).json({ message: error.message });
      if (error instanceof UserAlreadyExistsError || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
        return res.status(409).json({ message: "CPF ou e-mail já cadastrado" });
      }
      console.error("Falha no atendimento municipal", error instanceof Error ? error.name : "Erro desconhecido");
      return res.status(500).json({ message: "Erro interno" });
    }
  };
}

router.use("/activation", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
router.post("/activation/start", handle(async (req) => startActivation(z.object({ cpf }).parse(req.body).cpf), 202));
router.post("/activation/confirm", handle(async (req) => {
  const input = z.object({ challengeId: id, code: z.string().regex(/^\d{6}$/) }).parse(req.body);
  return confirmActivation(input.challengeId, input.code);
}));
router.post("/activation/complete", handle(async (req) => {
  const input = passwordFields.extend({ challengeId: id, activationToken: z.string().regex(/^[a-f0-9]{64}$/) })
    .refine((data) => data.password === data.passwordConfirmation, { message: "Senhas não conferem" }).parse(req.body);
  return activateResident(input.challengeId, input.activationToken, input.phone, input.password);
}));

router.use(authMiddleware);

router.post("/pre-registrations", requireRole(Role.COOPERATIVA, Role.PrefeituraVendedor), handle(async (req) =>
  createResident(req.user!.id, residentFields.parse(req.body)), 201));
router.delete("/pre-registrations/:id", requireRole(Role.MASTER), handle(async (req) =>
  eraseAccount(id.parse(req.params.id), true), 204));
router.post("/lookup", requireRole(Role.PrefeituraVendedor, Role.MASTER), handle(async (req) => {
  const user = await findResident(prisma, req.user!.id, z.object({ cpf }).parse(req.body).cpf);
  return { id: user.id, ecoCoinBalance: user.ecoCoinBalance, pendingActivation: user.pendingActivation };
}));
router.post("/credits", requireRole(Role.COOPERATIVA), handle(async (req) => {
  const input = z.object({ cpf, amount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).refine((amount) => Number(amount) > 0) }).parse(req.body);
  return creditResident(req.user!.id, input.cpf, input.amount, requestKey(req));
}, 201));
router.post("/sales", requireRole(Role.PrefeituraVendedor), (_req, res) =>
  res.status(410).json({ message: "Registre a venda pelo checkout do carrinho em /store/admin/carts/:id/checkout" }));
router.get("/audit/:userId", requireRole(Role.MASTER, Role.USER), handle(async (req) => {
  const userId = id.parse(req.params.userId);
  if (req.user!.role === Role.USER && req.user!.id !== userId) throw new StoreError("Acesso negado", 403);
  const query = z.object({ offset: z.coerce.number().int().nonnegative().max(2_147_483_647).default(0) }).parse(req.query);
  return prisma.storeAudit.findMany({
    where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: query.offset, take: 100,
    select: {
      id: true, operation: true, actorId: true, userId: true, amount: true, balanceBefore: true,
      balanceAfter: true, cartId: true, redemptionId: true, productId: true, quantity: true, createdAt: true,
    },
  });
}));

export default router;
