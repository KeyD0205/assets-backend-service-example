import type { NextFunction, Request, Response } from 'express';
import { badRequest } from '../shared/errors.js';

function sanitizeObject(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Reject keys starting with $ (MongoDB operators)
    if (key.startsWith('$')) {
      throw badRequest(`Invalid field name: "${key}" - MongoDB operators not allowed`);
    }
    
    // Prevent prototype pollution
    if (['__proto__', 'constructor', 'prototype'].includes(key)) {
      throw badRequest(`Invalid field name: "${key}" - reserved property`);
    }
    
    sanitized[key] = sanitizeObject(value);
  }
  return sanitized;
}

export function inputSanitization(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (req.body) req.body = sanitizeObject(req.body);
    if (req.query) req.query = sanitizeObject(req.query);
    next();
  } catch (err) {
    next(err);
  }
}
