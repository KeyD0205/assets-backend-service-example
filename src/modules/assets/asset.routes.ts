import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requireMinimumRole } from '../../middleware/requireRole.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { badRequest, notFound } from '../../shared/errors.js';
import { decodeCursor } from '../../shared/pagination.js';
import { getRequestContext } from '../../shared/request-context-helpers.js';
import { parseBody, parseQuery } from '../../shared/validation.js';
import { cache } from '../../shared/cache.js';
import { AssetRepository } from './asset.repository.js';
import {
  assetCursorSchema,
  assertNoProtectedAssetFields,
  createAssetSchema,
  listAssetQuerySchema,
  updateAssetSchema
} from './asset.validation.js';

const router = Router();
const assetRepository = new AssetRepository();
const assetIdParamSchema = z.string().uuid();

function invalidateTenantAssetCaches(tenantId: string): void {
  cache.deletePrefix(`tenant:${tenantId}:reports:`);
}

function assertWritablePayload(payload: Record<string, unknown>): void {
  try {
    assertNoProtectedAssetFields(payload);
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : 'Invalid asset payload');
  }
}

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const ctx = getRequestContext(req);
  const query = parseQuery(listAssetQuerySchema, req);
  const cursor = query.cursor ? decodeCursor(query.cursor, assetCursorSchema) : undefined;
  const limit = query.limit ?? 25;

  const result = await assetRepository.listByTenant(ctx.tenantId, {
    type: query.type,
    status: query.status,
    limit,
    cursor
  });

  res.json(result);
}));

router.post('/', requireMinimumRole('editor'), asyncHandler(async (req, res) => {
  const ctx = getRequestContext(req);
  assertWritablePayload(req.body as Record<string, unknown>);
  const body = parseBody(createAssetSchema, req);
  const asset = await assetRepository.create(ctx.tenantId, body);
  invalidateTenantAssetCaches(ctx.tenantId);
  res.setHeader('Location', `/v1/assets/${asset.id}`);
  res.status(201).json({ asset });
}));

router.get('/:assetId', asyncHandler(async (req, res) => {
  const ctx = getRequestContext(req);
  const assetId = assetIdParamSchema.parse(req.params.assetId);
  const asset = await assetRepository.findById(ctx.tenantId, assetId);
  if (!asset) throw notFound('Asset');
  res.json({ asset });
}));

router.patch('/:assetId', requireMinimumRole('editor'), asyncHandler(async (req, res) => {
  const ctx = getRequestContext(req);
  const assetId = assetIdParamSchema.parse(req.params.assetId);
  assertWritablePayload(req.body as Record<string, unknown>);
  const body = parseBody(updateAssetSchema, req);
  const asset = await assetRepository.update(ctx.tenantId, assetId, body);
  invalidateTenantAssetCaches(ctx.tenantId);
  res.json({ asset });
}));

router.delete('/:assetId', requireMinimumRole('editor'), asyncHandler(async (req, res) => {
  const ctx = getRequestContext(req);
  const assetId = assetIdParamSchema.parse(req.params.assetId);
  await assetRepository.delete(ctx.tenantId, assetId);
  invalidateTenantAssetCaches(ctx.tenantId);
  res.status(204).send();
}));

export const assetRoutes = router;
