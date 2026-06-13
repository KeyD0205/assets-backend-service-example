export type ErrorDetails = Array<{ field?: string; message: string }> | Record<string, unknown>;

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: ErrorDetails;
  public readonly expose: boolean;

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetails, expose = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expose = expose;
  }
}

export const badRequest = (message: string, details?: ErrorDetails) =>
  new AppError(400, 'bad_request', message, details);

export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'unauthorized', message);

export const forbidden = (message = 'Insufficient permissions') =>
  new AppError(403, 'forbidden', message);

export const notFound = (resource = 'Resource') =>
  new AppError(404, 'not_found', `${resource} not found`);

export const conflict = (message: string, details?: ErrorDetails) =>
  new AppError(409, 'conflict', message, details);

export const validationError = (details: ErrorDetails) =>
  new AppError(400, 'validation_error', 'Invalid request', details);
