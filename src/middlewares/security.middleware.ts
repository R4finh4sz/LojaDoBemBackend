import { NextFunction, Request, Response } from "express";
import { securityConfig } from "@/config/env";
import { prisma } from "@/lib/prisma";
import { createSearchHash } from "@/services/Auth/data-protection/data-protection.service";

interface AttemptRecord {
  count: number;
  resetAt: number;
  blockedUntil?: number;
}

const attempts = new Map<string, AttemptRecord>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getClientKey(req: Request) {
  const path = req.path.replace(/^(\/store\/admin\/carts\/)[^/]+/i, "$1:id");
  return `${req.ip}:${req.method}:${path}`;
}

export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const key = getClientKey(req);
  const current = attempts.get(key);

  if (current?.blockedUntil && current.blockedUntil > now) {
    await sleep(securityConfig.bruteForceDelayMs);
    return res.status(429).json({ message: "Muitas tentativas. Tente novamente mais tarde" });
  }

  const record =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + securityConfig.rateLimitWindowMs }
      : current;

  record.count += 1;

  const path = req.path.toLowerCase();
  const maxAttempts = path.startsWith("/store/") || path === "/master/dashboard" || path === "/account/sessions"
    ? securityConfig.storeRateLimitMaxAttempts
    : securityConfig.rateLimitMaxAttempts;
  if (record.count > maxAttempts) {
    record.blockedUntil = now + securityConfig.bruteForceBlockMs;
    attempts.set(key, record);
    try {
      await prisma.securityEvent.create({ data: {
        kind: "RATE_LIMIT_BLOCK", clientKey: createSearchHash(req.ip ?? req.socket.remoteAddress ?? "unknown"),
        blockedUntil: new Date(record.blockedUntil),
      } });
    } catch {
      console.error("Falha ao registrar bloqueio por rate limit");
    }
    await sleep(securityConfig.bruteForceDelayMs);
    return res.status(429).json({ message: "Muitas tentativas. Tente novamente mais tarde" });
  }

  attempts.set(key, record);
  return next();
}
