import type { NextFunction, Request, Response } from 'express';
import type { RequestContext } from './request-context.js';
import { unauthorized } from './errors.js';

/**
 * Type guard to check if request has context
 * Usage: if (hasContext(req)) { ... req.ctx is now non-null }
 */
export function hasContext(req: Request): req is Request & { ctx: RequestContext } {
  return req.ctx !== undefined;
}

/**
 * Middleware that enforces non-null context
 * Use on routes that require authentication
 * Ensures req.ctx is available and typed as non-null
 */
export function requireContext(req: Request, _res: Response, next: NextFunction): void {
  if (!hasContext(req)) {
    throw unauthorized('Authentication required');
  }
  next();
}

/**
 * Helper to extract context with type safety
 * Throws if context is missing
 */
export function getRequestContext(req: Request): RequestContext {
  if (!hasContext(req)) {
    throw unauthorized('Authentication required');
  }
  return req.ctx;
}

/**
 * Helper to safely access tenant ID from request
 */
export function getTenantId(req: Request): string {
  return getRequestContext(req).tenantId;
}

/**
 * Helper to safely access user ID from request
 */
export function getUserId(req: Request): string {
  return getRequestContext(req).userId;
}

/**
 * Helper to safely access role from request
 */
export function getRole(req: Request): string {
  return getRequestContext(req).role;
}
