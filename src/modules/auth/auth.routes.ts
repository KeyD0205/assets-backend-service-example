import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { conflict, unauthorized } from '../../shared/errors.js';
import { verifyPassword } from '../../shared/passwords.js';
import { parseBody } from '../../shared/validation.js';
import { UserRepository } from '../users/user.repository.js';
import { toPublicUser } from '../users/user.types.js';
import { createTokenSchema } from './auth.validation.js';

const router = Router();
const userRepository = new UserRepository();

// Applied unconditionally — credential endpoints need brute-force protection
// regardless of the global ENABLE_RATE_LIMIT flag. skipSuccessfulRequests
// means only failed attempts consume the budget, so legitimate usage is not
// throttled.
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/tokens', authLimiter, asyncHandler(async (req, res) => {
  const body = parseBody(createTokenSchema, req);
  const matches = await userRepository.findForAuth(body.email, body.tenant_slug, body.tenant_id);

  if (matches.length === 0) throw unauthorized('Invalid credentials');
  if (matches.length > 1) {
    throw conflict('Email exists in multiple tenants; include tenant_slug or tenant_id');
  }

  const user = matches[0];
  if (!user) throw unauthorized('Invalid credentials');
  if (!(await verifyPassword(body.password, user.password_hash))) {
    throw unauthorized('Invalid credentials');
  }

  const accessToken = jwt.sign(
    { sub: user.id, tenant_id: user.tenant_id },
    env.JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: env.TOKEN_TTL_SECONDS,
      jwtid: randomUUID(),
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE
    }
  );

  // Derive expires_in from the signed token's exp claim rather than the
  // configured TTL so the value accounts for rounding inside jwt.sign.
  const { exp } = jwt.decode(accessToken) as { exp: number };
  const expiresIn = Math.max(0, Math.floor(exp - Date.now() / 1000));

  res.status(200).json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    user: toPublicUser(user)
  });
}));

export const authRoutes = router;
