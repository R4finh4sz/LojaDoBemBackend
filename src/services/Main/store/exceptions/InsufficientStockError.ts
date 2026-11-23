import { StoreError } from "./StoreError";

export class InsufficientStockError extends StoreError {
  constructor() {
    super("Estoque insuficiente", 409);
  }
}
