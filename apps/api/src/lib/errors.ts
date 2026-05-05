/**
 * Erreurs métier — toujours préférer une instance d'AppError
 * plutôt qu'un throw direct, pour avoir un code HTTP propre côté client.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  badRequest: (msg: string, details?: unknown) =>
    new AppError(400, "bad_request", msg, details),
  unauthorized: (msg = "Authentication required") =>
    new AppError(401, "unauthorized", msg),
  forbidden: (msg = "Forbidden") => new AppError(403, "forbidden", msg),
  notFound: (msg = "Not found") => new AppError(404, "not_found", msg),
  conflict: (msg: string) => new AppError(409, "conflict", msg),
  rateLimited: (msg = "Too many requests") =>
    new AppError(429, "rate_limited", msg),
  internal: (msg = "Internal server error") =>
    new AppError(500, "internal", msg),
};
