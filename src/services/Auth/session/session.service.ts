import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import { authConfig } from "@/config/env";
import type { SessionMetadata } from "./session-metadata";
import type { Role } from "@prisma/client";
import jwt from "jsonwebtoken";
import { roleLevel } from "@/config/roles";
import type { AuthResult, AuthTokenPayload } from "@/types/auth.types";

export function getSessionExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + authConfig.sessionExpiresMinutes);

  return expiresAt;
}

export async function issueSessionToken(user: { id: string; role: Role }, metadata?: SessionMetadata): Promise<AuthResult> {
  const payload: AuthTokenPayload = {
    sub: user.id,
    sid: randomUUID(),
    role: user.role,
    level: roleLevel(user.role),
  };
  const configuredToken = jwt.sign(payload, authConfig.jwtSecret, { expiresIn: authConfig.jwtExpiresIn } as jwt.SignOptions);
  const tokenExpiry = (jwt.decode(configuredToken) as jwt.JwtPayload).exp!;
  const effectiveExpiry = Math.min(tokenExpiry, Math.floor(getSessionExpiresAt().getTime() / 1000));
  const token = effectiveExpiry === tokenExpiry
    ? configuredToken
    : jwt.sign({ ...payload, exp: effectiveExpiry }, authConfig.jwtSecret);
  await prisma.session.create({
    data: {
      id: payload.sid,
      userId: user.id,
      ...metadata,
      expiresAt: new Date(effectiveExpiry * 1000),
    },
  });
  return { token };
}

export async function listSessionHistory(userId: string, sessionId: string, page: number, limit: number) {
  const where = { userId };
  const [total, sessions] = await prisma.$transaction([
    prisma.session.count({ where }),
    prisma.session.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, createdAt: true, expiresAt: true, revokedAt: true, browser: true, device: true, city: true, region: true },
    }),
  ], { isolationLevel: "RepeatableRead" });
  const now = new Date();
  return {
    sessions: sessions.map((session) => ({
      ...session,
      status: session.id === sessionId ? "CURRENT" : session.revokedAt ? "REVOKED" :
        session.expiresAt <= now ? "EXPIRED" : "ACTIVE",
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function revokeSession(sessionId: string) {
  await prisma.session.updateMany({
    where: {
      id: sessionId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function getActiveSessionRole(sessionId: string, userId: string) {
  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      userId,
      revokedAt: null,
      user: { active: true, deletedAt: null, firstLogin: false },
      expiresAt: {
        gt: new Date(),
      },
    },
    select: {
      user: { select: { role: true } },
    },
  });

  return session?.user.role;
}
