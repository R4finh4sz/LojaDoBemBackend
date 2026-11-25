import { z } from "zod";

const REQUIRED_FIELD_MESSAGE = "Campo obrigatório";

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function isValidCpf(value: string) {
  const cpf = onlyDigits(value);

  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  const calculateDigit = (base: string, factor: number) => {
    const total = base
      .split("")
      .reduce((sum, digit) => sum + Number(digit) * factor--, 0);
    const remainder = (total * 10) % 11;

    return remainder === 10 ? 0 : remainder;
  };

  const firstDigit = calculateDigit(cpf.slice(0, 9), 10);
  const secondDigit = calculateDigit(cpf.slice(0, 10), 11);

  return firstDigit === Number(cpf[9]) && secondDigit === Number(cpf[10]);
}

function ageInYears(birthDate: Date) {
  const today = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [day, month, year] = today.split("/").map(Number);
  const birthdayPassed = month * 32 + day >= (birthDate.getUTCMonth() + 1) * 32 + birthDate.getUTCDate();
  return year - birthDate.getUTCFullYear() - (birthdayPassed ? 0 : 1);
}

export const registerFields = z.object({
  name: z
    .string({ required_error: REQUIRED_FIELD_MESSAGE })
    .transform(normalizeText)
    .pipe(z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100, "Nome muito longo")),
  cpf: z
    .string({ required_error: REQUIRED_FIELD_MESSAGE })
    .transform(onlyDigits)
    .pipe(z.string().refine(isValidCpf, "CPF inválido")),
  birthDate: z
    .union([z.string().date(), z.string().datetime({ offset: true })], {
      errorMap: (_issue, context) => ({
        message: context.data === undefined ? REQUIRED_FIELD_MESSAGE : "Data de nascimento inválida. Use AAAA-MM-DD",
      }),
    })
    .transform((value) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`))
    .refine((date) => {
      const age = ageInYears(date);
      return age >= 18 && age <= 90;
    }, "Idade deve ser de 18 a 90 anos"),
  phone: z
    .string({ required_error: REQUIRED_FIELD_MESSAGE })
    .transform(onlyDigits)
    .pipe(z.string().min(10, "Telefone inválido").max(11, "Telefone inválido")),
  cep: z
    .string({ required_error: REQUIRED_FIELD_MESSAGE })
    .transform(onlyDigits)
    .pipe(z.string().length(8, "CEP inválido")),
  address: z
    .string({ required_error: REQUIRED_FIELD_MESSAGE })
    .transform(normalizeText)
    .pipe(z.string().min(2, "Endereço obrigatório").max(255, "Endereço muito longo")),
  city: z
    .string({ required_error: REQUIRED_FIELD_MESSAGE })
    .transform(normalizeText)
    .pipe(z.string().min(2, "Cidade inválida").max(100, "Cidade muito longa"))
    .optional(),
  state: z
    .string({ required_error: REQUIRED_FIELD_MESSAGE })
    .transform(normalizeText)
    .pipe(z.string().min(2, "Estado inválido").max(50, "Estado muito longo"))
    .optional(),
  profilePhoto: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value.toLowerCase() : undefined)),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "Aceite dos termos obrigatório" }),
  }),
  email: z
    .string({ required_error: REQUIRED_FIELD_MESSAGE })
    .trim()
    .email("E-mail inválido")
    .transform((email) => email.toLowerCase()),
  password: z
    .string({ required_error: REQUIRED_FIELD_MESSAGE })
    .min(8, "Senha deve ter pelo menos 8 caracteres")
    .max(128, "Senha muito longa"),
  passwordConfirmation: z
    .string({ required_error: REQUIRED_FIELD_MESSAGE })
    .min(8, "Confirmação de senha obrigatória")
    .max(128, "Confirmação de senha muito longa"),
});

const passwordConfirmationError = {
  message: "Senhas não conferem",
  path: ["passwordConfirmation"],
};

export const registerSchema = registerFields.refine(
  (data) => data.password === data.passwordConfirmation,
  passwordConfirmationError,
);

export const registerOperatorSchema = registerFields
  .omit({ termsAccepted: true, password: true, passwordConfirmation: true });

export const operatorInvitationPasswordSchema = registerFields
  .pick({ password: true, passwordConfirmation: true })
  .refine((data) => Buffer.byteLength(data.password, "utf8") <= 72, {
    message: "A senha deve ter até 72 bytes em UTF-8",
    path: ["password"],
  })
  .refine((data) => data.password === data.passwordConfirmation, passwordConfirmationError);
