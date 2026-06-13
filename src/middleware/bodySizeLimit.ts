import type { Request, Response, NextFunction } from 'express';
import express from 'express';

/**
 * Body size limit configurations by route/operation
 * Helps prevent abuse and memory exhaustion attacks
 * Global default is 50kb - routes needing more explicitly override
 */
export const BODY_SIZE_LIMITS = {
  // Authentication operations - small payloads (email + tenant info)
  AUTH: '20kb',
  
  // Asset operations - larger for metadata
  ASSET_CREATE: '500kb',
  ASSET_UPDATE: '500kb',
  
  // User operations - small payloads (name + email)
  USER_CREATE: '50kb',
  USER_UPDATE: '50kb',
  
  // Tenant operations - small payloads
  TENANT_CREATE: '50kb',
  TENANT_UPDATE: '50kb',
  
  // Default/global limit
  DEFAULT: '50kb'
} as const;

/**
 * Factory function to create JSON body parser with size limit
 * @param limit - Size limit string (e.g., '100kb', '1mb')
 * @returns Express middleware
 */
export function createBodyLimiter(limit: string) {
  return express.json({ 
    limit,
    strict: true,
    type: 'application/json'
  });
}

/**
 * Dynamic body limiter middleware
 * Applies appropriate size limits based on request path
 * Prevents needing to apply parsers at multiple levels
 */
export function dynamicBodyLimiter(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;
  
  // Determine appropriate limit based on path
  let limit = BODY_SIZE_LIMITS.DEFAULT;
  
  if (path.startsWith('/v1/auth')) {
    limit = BODY_SIZE_LIMITS.AUTH;
  } else if (path.startsWith('/v1/assets')) {
    limit = BODY_SIZE_LIMITS.ASSET_CREATE;
  }
  
  // Apply the parser for this specific limit
  express.json({ limit, strict: true, type: 'application/json' })(req, res, next);
}
