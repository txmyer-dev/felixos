export class N8nUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "N8nUnavailableError";
  }
}

export function isN8nUnavailableError(error: unknown): error is N8nUnavailableError {
  return error instanceof N8nUnavailableError;
}
