import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized } from '../shared/errors.js';
import { UserRepository } from '../modules/users/user.repository.js';

const userRepository = new UserRepository();

type TokenPayload = {
  sub: string;
  tenant_id: string;
};

/**
 * Authenticates requests by validating JWT tokens
 * Sets req.ctx with user information after successful validation
 * 
 * After this middleware runs successfully:
 * - req.ctx is guaranteed to be non-null
 * - req.ctx.userId, tenantId, and role are populated
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw unauthorized();

    const token = header.slice('Bearer '.length).trim();
    if (!token) throw unauthorized();

    const payload = jwt.verify(token, env.JWT_SECRET, { 
      algorithms: ['HS256'], 
      issuer: 'multi-tenant-asset-service', 
      audience: 'asset-service-api' 
    }) as Partial<TokenPayload>;
    
    if (!payload.sub || !payload.tenant_id) {
      throw unauthorized('Invalid token payload');
    }

    const user = await userRepository.findByIdInTenant(payload.tenant_id, payload.sub);
    if (!user) throw unauthorized('User no longer exists');

    // Set context with guaranteed non-null values
    req.ctx = {
      requestId: req.requestId,
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role
    };
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
      next(unauthorized('Invalid or expired token'));
      return;
    }
    next(err);
  }
}
