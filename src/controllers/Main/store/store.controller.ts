import { Request, Response } from "express";
import { createProduct, getEcoCoinBalance, listAdminProducts, listAdminRedemptions, listProductsForUser, listUserRedemptions, redeemProduct, StoreError, validatePickupCode } from "@/services/Main/store/store.service";
import { createSearchHash } from "@/services/Auth/data-protection/data-protection.service";

async function respond(res: Response, action: () => Promise<unknown>, status = 200) {
  try { return res.status(status).json(await action()); }
  catch (error) {
    if (error instanceof StoreError) return res.status(error.status).json({ message: error.message });
    console.error(error);
    return res.status(500).json({ message: "Erro interno na loja" });
  }
}

export const createProductController = (req: Request, res: Response) => respond(res, async () => ({ product: await createProduct(req.user!.id, req.body) }), 201);
export const listProductsController = (req: Request, res: Response) => respond(res, async () => ({ products: await listProductsForUser(req.user!.id) }));
export const listAdminProductsController = (req: Request, res: Response) => respond(res, async () => ({ products: await listAdminProducts(req.user!.id) }));
export const balanceController = (req: Request, res: Response) => respond(res, async () => ({ balance: await getEcoCoinBalance(req.user!.id), currency: "EcoCoin" }));
export const redeemController = (req: Request, res: Response) => respond(res, async () => {
  const key = req.get("Idempotency-Key")?.trim();
  if (key !== undefined && (!key || key.length > 128)) throw new StoreError("Chave de idempotência inválida", 400);
  return { redemption: await redeemProduct(req.user!.id, req.body.productId, req.body.quantity, key ? createSearchHash(key) : undefined) };
}, 201);
export const userRedemptionsController = (req: Request, res: Response) => respond(res, async () => ({ redemptions: await listUserRedemptions(req.user!.id) }));
export const adminRedemptionsController = (req: Request, res: Response) => respond(res, async () => ({ redemptions: await listAdminRedemptions(req.user!.id) }));
export const validatePickupController = (req: Request, res: Response) => respond(res, async () => ({ redemption: await validatePickupCode(req.user!.id, req.body.code) }));
