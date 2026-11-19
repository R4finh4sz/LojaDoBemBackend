import { StoreError } from "./StoreError";

export class InsufficientBalanceError extends StoreError {
  constructor() {
    super("Saldo EcoCoin insuficiente", 409);
  }
}
