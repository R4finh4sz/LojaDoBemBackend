import { Role } from "@prisma/client";

export const ROLE_LEVEL: Record<Role, number> = {
  USER: 1,
  COOPERATIVA: 2,
  PrefeituraVendedor: 3,
  MASTER: 4,
};

export function roleLevel(role: Role): number {
  return ROLE_LEVEL[role];
}
