import type { Request } from 'express';
import type { z } from 'zod';
import { validationError } from './errors.js';

export function parseBody<T>(schema: z.ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw validationError(result.error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message
    })));
  }
  return result.data;
}

export function parseQuery<T>(schema: z.ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    throw validationError(result.error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message
    })));
  }
  return result.data;
}
