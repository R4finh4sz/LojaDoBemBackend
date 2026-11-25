function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const corsConfig = {
  allowedOrigin: process.env.CORS_ALLOWED_ORIGIN?.trim(),
};

export const authConfig = {
  jwtSecret: getRequiredEnv("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  sessionExpiresMinutes: Number(process.env.SESSION_EXPIRES_MINUTES || 60),
  sessionLocationProxySecret: process.env.SESSION_LOCATION_PROXY_SECRET,
};

export const dataProtectionConfig = {
  encryptionKey: getRequiredEnv("DATA_ENCRYPTION_KEY"),
};

export const masterConfig = {
  email: process.env.MASTER_EMAIL?.trim().toLowerCase(),
  password: process.env.MASTER_PASSWORD,
};

export const resendConfig = {
  apiKey: process.env.RESEND_API_KEY?.trim(),
  senderEmail: process.env.RESEND_SENDER_EMAIL?.trim(),
  senderName: process.env.RESEND_SENDER_NAME?.trim() || "ReciclaOnline",
};

export const securityConfig = {
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  rateLimitMaxAttempts: Number(process.env.RATE_LIMIT_MAX_ATTEMPTS || 6),
  storeRateLimitMaxAttempts: Number(process.env.STORE_RATE_LIMIT_MAX_ATTEMPTS || 300),
  bruteForceBlockMs: Number(process.env.BRUTE_FORCE_BLOCK_MS || 15 * 60 * 1000),
  bruteForceDelayMs: Number(process.env.BRUTE_FORCE_DELAY_MS || 500),
  twoFactorCodeExpiresMinutes: Number(process.env.TWO_FACTOR_CODE_EXPIRES_MINUTES || 15),
  twoFactorMaxAttempts: Number(process.env.TWO_FACTOR_MAX_ATTEMPTS || 6),
  passwordResetCodeExpiresMinutes: Number(process.env.PASSWORD_RESET_CODE_EXPIRES_MINUTES || 15),
  passwordResetTokenExpiresMinutes: Number(process.env.PASSWORD_RESET_TOKEN_EXPIRES_MINUTES || 15),
  passwordResetMaxAttempts: Number(process.env.PASSWORD_RESET_MAX_ATTEMPTS || 5),
  passwordResetBlockHours: Number(process.env.PASSWORD_RESET_BLOCK_HOURS || 6),
};
