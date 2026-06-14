import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized } from '../shared/errors.js';
import { TtlCache } from '../shared/cache.js';
import { UserRepository } from '../modules/users/user.repository.js';
import type { User } from '../modules/users/user.types.js';

const userRepository = new UserRepository();

// In-process cache: reduces per-request DB reads at the cost of a short
// staleness window (TOKEN_TTL_SECONDS / 2). In a single-process deployment
// invalidateUserAuthCache keeps the cache consistent on role/delete mutations.
// In a multi-instance deployment each instance holds its own cache island —
// a demoted or deleted user may retain the previous role on other instances
// until their cache entry expires. Switch to a shared Redis cache to close
// this gap in multi-instance deployments.
const userCache = new TtlCache();

// Call this after any user mutation (role change, delete) to evict the cached
// user from the local auth cache.
export function invalidateUserAuthCache(tenantId: string, userId: string): void {
  userCache.delete(`${tenantId}:${userId}`);
}

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

    const raw = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE
    });

    if (typeof raw === 'string') throw unauthorized('Invalid token payload');

    const sub = raw.sub;
    const tenantId = raw['tenant_id'];
    if (typeof sub !== 'string' || typeof tenantId !== 'string') {
      throw unauthorized('Invalid token payload');
    }

    const cacheKey = `${tenantId}:${sub}`;
    let user = userCache.get<User>(cacheKey);

    if (!user) {
      user = await userRepository.findByIdInTenant(tenantId, sub) ?? undefined;
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
