import { z } from "zod";

export const cnpjSchema = z.string().transform((value) => value.replace(/[^a-z0-9]/gi, "").toUpperCase()).refine((value) => {
  if (!/^[A-Z0-9]{12}\d{2}$/.test(value) || /^(\d)\1{13}$/.test(value)) return false;
  const digit = (base: string, weights: number[]) => {
    const remainder = weights.reduce((sum, weight, index) => sum + (base.charCodeAt(index) - 48) * weight, 0) % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return digit(value, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(value[12]) &&
    digit(value, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(value[13]);
}, "CNPJ inválido");
