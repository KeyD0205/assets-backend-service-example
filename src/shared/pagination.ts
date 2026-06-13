import { z } from 'zod';
import { badRequest } from './errors.js';

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional()
});

export type Page<T> = {
  data: T[];
  next_cursor: string | null;
};

export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor<T>(cursor: string, schema: z.ZodType<T>): T {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    return schema.parse(JSON.parse(raw));
  } catch {
    throw badRequest('Invalid pagination cursor');
  }
}
