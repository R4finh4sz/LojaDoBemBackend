import { Request, Response } from "express";
import { z, ZodError } from "zod";
import { createProduct, getEcoCoinBalance, listAdminProducts, listAdminRedemptions, listProductsForUser, listUserRedemptions, redeemProduct, StoreError, validatePickupCode } from "@/services/Main/store/store.service";
import { createSearchHash } from "@/services/Auth/data-protection/data-protection.service";
import { barcodePattern } from "@/dto/store/barcode-pattern";

export async function respond(res: Response, action: () => Promise<unknown>, status = 200) {
  try {
    const result = await action();
    if (res.headersSent) return;
    return status === 204 ? res.status(status).end() : res.status(status).json(result);
  }
  catch (error) {
    if (error instanceof StoreError) return res.status(error.status).json({ message: error.message });
    if (error instanceof ZodError) return res.status(400).json({ errors: error.flatten() });
    console.error(error);
    return res.status(500).json({ message: "Erro interno na loja" });
  }
}

export const createProductController = (req: Request, res: Response) => respond(res, async () => ({ product: await createProduct(req.user!.id, req.body) }), 201);
export const listProductsController = (req: Request, res: Response) => respond(res, async () => ({ products: await listProductsForUser(req.user!.id) }));
export const listAdminProductsController = (req: Request, res: Response) => respond(res, async () => {
  const { barcode } = z.object({ barcode: z.string().trim().regex(barcodePattern).optional() }).parse(req.query);
  return { products: await listAdminProducts(req.user!.id, barcode) };
});
export const balanceController = (req: Request, res: Response) => respond(res, async () => ({ balance: await getEcoCoinBalance(req.user!.id), currency: "EcoCoin" }));
export const redeemController = (req: Request, res: Response) => respond(res, async () => {
  const key = req.get("Idempotency-Key")?.trim();
  if (key !== undefined && (!key || key.length > 128)) throw new StoreError("Chave de idempotência inválida", 400);
  return { redemption: await redeemProduct(req.user!.id, req.body.productId, req.body.quantity, key ? createSearchHash(key) : undefined) };
}, 201);
export const userRedemptionsController = (req: Request, res: Response) => respond(res, async () => ({ redemptions: await listUserRedemptions(req.user!.id) }));
export const adminRedemptionsController = (req: Request, res: Response) => respond(res, async () => ({ redemptions: await listAdminRedemptions(req.user!.id) }));
export const validatePickupController = (req: Request, res: Response) => respond(res, async () => ({ redemption: await validatePickupCode(req.user!.id, req.body.code) }));
