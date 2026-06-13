import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { notFound } from '../../shared/errors.js';
import { parseBody } from '../../shared/validation.js';
import { toPublicUser } from '../users/user.types.js';
import { TenantRepository } from './tenant.repository.js';
import { createTenantSchema } from './tenant.validation.js';

const router = Router();
const tenantRepository = new TenantRepository();

router.post('/', asyncHandler(async (req, res) => {
  const body = parseBody(createTenantSchema, req);
  const created = await tenantRepository.createWithAdmin(body);
  res.status(201).json({
    tenant: created.tenant,
    admin: toPublicUser(created.admin)
  });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const tenant = await tenantRepository.findById(req.ctx!.tenantId);
  if (!tenant) throw notFound('Tenant');
  res.json({ tenant });
}));

export const tenantRoutes = router;
