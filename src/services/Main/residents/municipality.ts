import { z } from "zod";
import { decryptSensitiveData } from "@/services/Auth/data-protection/data-protection.service";
import { StoreError } from "@/services/Main/store/exceptions/StoreError";

type Location = { city: string; state: string };

export function sameLocation(a: Location, b: Location) {
  const normalize = (value: string) => value.trim().normalize("NFC").toLocaleLowerCase("pt-BR");
  return normalize(a.city) === normalize(b.city) && normalize(a.state) === normalize(b.state);
}

export function decryptedLocation(value: Location) {
  return { city: decryptSensitiveData(value.city), state: decryptSensitiveData(value.state) };
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
