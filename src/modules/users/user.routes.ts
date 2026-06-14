import { Router } from 'express';
import { z } from 'zod';
import { authenticate, invalidateUserAuthCache } from '../../middleware/auth.js';
import { requireMinimumRole } from '../../middleware/requireRole.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { badRequest, forbidden, notFound } from '../../shared/errors.js';
import { decodeCursor, encodeCursor, paginationQuerySchema } from '../../shared/pagination.js';
import { getRequestContext } from '../../shared/request-context-helpers.js';
import { parseBody, parseQuery } from '../../shared/validation.js';
import { UserRepository } from './user.repository.js';
import { toPublicUser } from './user.types.js';
import { createUserSchema, updateUserSchema, userCursorSchema } from './user.validation.js';

const router = Router();
const userRepository = new UserRepository();
const userIdParamSchema = z.string().uuid();

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const ctx = getRequestContext(req);
  const query = parseQuery(paginationQuerySchema, req);
  const cursor = query.cursor ? decodeCursor(query.cursor, userCursorSchema) : undefined;
  const limit = query.limit ?? 25;
  const users = await userRepository.listByTenant(ctx.tenantId, { limit: limit + 1, cursor });
  const page = users.slice(0, limit);
  const next = users.length > limit ? page.at(-1) : undefined;
  res.json({
    data: page.map(toPublicUser),
    next_cursor: next ? encodeCursor({ created_at: next.created_at, id: next.id }) : null
  });
}));

router.post('/', requireMinimumRole('admin'), asyncHandler(async (req, res) => {
  const ctx = getRequestContext(req);
  const body = parseBody(createUserSchema, req);
  const user = await userRepository.createInTenant(ctx.tenantId, body);
  res.status(201).json({ user: toPublicUser(user) });
}));

router.get('/:userId', asyncHandler(async (req, res) => {
  const ctx = getRequestContext(req);
  const userId = userIdParamSchema.parse(req.params.userId);
  const user = await userRepository.findByIdInTenant(ctx.tenantId, userId);
  if (!user) throw notFound('User');
  res.json({ user: toPublicUser(user) });
}));

router.patch('/:userId', requireMinimumRole('admin'), asyncHandler(async (req, res) => {
  const ctx = getRequestContext(req);
  const userId = userIdParamSchema.parse(req.params.userId);
  if (userId === ctx.userId && req.body.role && req.body.role !== ctx.role) {
    throw badRequest('Users cannot change their own role');
  }

  const body = parseBody(updateUserSchema, req);
  const user = await userRepository.updateInTenant(ctx.tenantId, userId, body);
  invalidateUserAuthCache(ctx.tenantId, userId);
  res.json({ user: toPublicUser(user) });
}));

router.delete('/:userId', requireMinimumRole('admin'), asyncHandler(async (req, res) => {
  const ctx = getRequestContext(req);
  const userId = userIdParamSchema.parse(req.params.userId);
  if (userId === ctx.userId) throw forbidden('Users cannot delete themselves');

  await userRepository.deleteInTenant(ctx.tenantId, userId);
  invalidateUserAuthCache(ctx.tenantId, userId);
  res.status(204).send();
}));

export const userRoutes = router;
