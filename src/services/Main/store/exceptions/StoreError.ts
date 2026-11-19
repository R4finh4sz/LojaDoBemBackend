export class StoreError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = new.target.name;
  }
}
