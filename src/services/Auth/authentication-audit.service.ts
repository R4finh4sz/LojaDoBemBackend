import type { SecurityEventKind } from "@prisma/client";
import type { Request } from "express";
import { prisma } from "@/lib/prisma";
import { createSearchHash } from "@/services/Auth/data-protection/data-protection.service";

export async function recordAuthenticationEvent(
  req: Request,
  kind: Exclude<SecurityEventKind, "RATE_LIMIT_BLOCK" | "TWO_FACTOR_BLOCK">,
) {
  try {
    const address = req.ip ?? req.socket.remoteAddress;
    await prisma.securityEvent.create({
      data: { kind, clientKey: address ? createSearchHash(address) : null },
    });
  } catch {
    console.error("Falha ao registrar evento de autenticação", kind);
  }
}
