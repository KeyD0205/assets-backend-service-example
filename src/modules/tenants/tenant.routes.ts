import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { notFound } from '../../shared/errors.js';
import { getRequestContext } from '../../shared/request-context-helpers.js';
import { parseBody } from '../../shared/validation.js';
import { toPublicUser } from '../users/user.types.js';
import { TenantRepository } from './tenant.repository.js';
import { createTenantSchema } from './tenant.validation.js';

const router = Router();
const tenantRepository = new TenantRepository();

// Unauthenticated endpoint — apply a tight per-route limit that is
// independent of the global ENABLE_RATE_LIMIT flag.
const tenantCreateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/', tenantCreateLimiter, asyncHandler(async (req, res) => {
  const body = parseBody(createTenantSchema, req);
  const created = await tenantRepository.createWithAdmin(body);
  res.status(201).json({
    tenant: created.tenant,
    admin: toPublicUser(created.admin)
  });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const ctx = getRequestContext(req);
  const tenant = await tenantRepository.findById(ctx.tenantId);
  if (!tenant) throw notFound('Tenant');
  res.json({ tenant });
}));

export const tenantRoutes = router;
