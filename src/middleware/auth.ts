import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized } from '../shared/errors.js';
import { TtlCache } from '../shared/cache.js';
import { UserRepository } from '../modules/users/user.repository.js';
import type { User } from '../modules/users/user.types.js';

const userRepository = new UserRepository();
const userCache = new TtlCache();

export function invalidateUserAuthCache(tenantId: string, userId: string): void {
  userCache.delete(`${tenantId}:${userId}`);
}

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
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE
    }) as Partial<TokenPayload>;

    if (!payload.sub || !payload.tenant_id) {
      throw unauthorized('Invalid token payload');
    }

    const cacheKey = `${payload.tenant_id}:${payload.sub}`;
    let user = userCache.get<User>(cacheKey);

    if (!user) {
      user = await userRepository.findByIdInTenant(payload.tenant_id, payload.sub) ?? undefined;
      if (!user) throw unauthorized('User no longer exists');
      userCache.set(cacheKey, user, Math.floor(env.TOKEN_TTL_SECONDS / 2));
    }

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
