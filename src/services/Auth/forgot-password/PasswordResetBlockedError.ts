export class PasswordResetBlockedError extends Error {
  constructor(message: string, public readonly blockedUntil: Date) {
    super(message);
  }
}
