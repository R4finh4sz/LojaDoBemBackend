import { randomUUID } from "crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { decryptSensitiveData } from "@/services/Auth/data-protection/data-protection.service";
import { StoreError } from "@/services/Main/store/exceptions/StoreError";

type Location = { city: string; state: string };

export function sameLocation(a: Location, b: Location) {
  const first = normalizeMunicipality(a);
  const second = normalizeMunicipality(b);
  return first.city === second.city && first.state === second.state;
}

export function decryptedLocation(value: Location) {
  return { city: decryptSensitiveData(value.city), state: decryptSensitiveData(value.state) };
}

export function normalizeMunicipality({ city, state }: Location): Location {
  const normalize = (value: string) => value.trim().normalize("NFC").toLowerCase();
  return { city: normalize(city), state: normalize(state) };
}

export async function ensureMunicipality(tx: Prisma.TransactionClient, location: Location) {
  const { city, state } = normalizeMunicipality(location);
  await tx.$executeRaw`
    INSERT INTO municipalities (id, city, state) VALUES (${randomUUID()}, ${city}, ${state})
    ON CONFLICT (city, state) DO NOTHING
  `;
  return tx.municipality.findUniqueOrThrow({ where: { city_state: { city, state } } });
}

export async function resolveMunicipality(cep: string): Promise<Location> {
  if (!/^\d{8}$/.test(cep)) throw new StoreError("CEP inválido", 400);
  let body: unknown;
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Falha na consulta");
    body = await response.json();
  } catch {
    throw new StoreError("Consulta de CEP temporariamente indisponível", 503);
  }
  if (z.object({ erro: z.union([z.literal(true), z.literal("true")]) }).safeParse(body).success) {
    throw new StoreError("CEP não encontrado", 400);
  }
  const result = z.object({ localidade: z.string().min(1), uf: z.string().length(2) }).safeParse(body);
  if (!result.success) throw new StoreError("Resposta inválida na consulta de CEP", 503);
  return { city: result.data.localidade.toLowerCase(), state: result.data.uf.toLowerCase() };
}
