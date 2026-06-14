import type { Request, Response, NextFunction } from 'express';
import express from 'express';

export const BODY_SIZE_LIMITS = {
  AUTH: '20kb',
  ASSET_CREATE: '500kb',
  ASSET_UPDATE: '500kb',
  USER_CREATE: '50kb',
  USER_UPDATE: '50kb',
  TENANT_CREATE: '50kb',
  TENANT_UPDATE: '50kb',
  DEFAULT: '50kb'
} as const;

export function createBodyLimiter(limit: string) {
  return express.json({ limit, strict: true, type: 'application/json' });
}

const authParser = createBodyLimiter(BODY_SIZE_LIMITS.AUTH);
const assetParser = createBodyLimiter(BODY_SIZE_LIMITS.ASSET_CREATE);
const defaultParser = createBodyLimiter(BODY_SIZE_LIMITS.DEFAULT);

export function dynamicBodyLimiter(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith('/v1/auth')) {
    authParser(req, res, next);
  } else if (req.path.startsWith('/v1/assets')) {
    assetParser(req, res, next);
  } else {
    defaultParser(req, res, next);
  }
}
