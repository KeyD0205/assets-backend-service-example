import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requireMinimumRole } from '../../middleware/requireRole.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { badRequest, notFound } from '../../shared/errors.js';
import { decodeCursor } from '../../shared/pagination.js';
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
  const query = parseQuery(listAssetQuerySchema, req);
  const cursor = query.cursor ? decodeCursor(query.cursor, assetCursorSchema) : undefined;
  const limit = query.limit ?? 25;

  const result = await assetRepository.listByTenant(req.ctx!.tenantId, {
    type: query.type,
    status: query.status,
    limit,
    cursor
  });

  res.json(result);
}));

router.post('/', requireMinimumRole('editor'), asyncHandler(async (req, res) => {
  assertWritablePayload(req.body as Record<string, unknown>);
  const body = parseBody(createAssetSchema, req);
  const asset = await assetRepository.create(req.ctx!.tenantId, body);
  invalidateTenantAssetCaches(req.ctx!.tenantId);
  res.status(201).json({ asset });
}));

router.get('/:assetId', asyncHandler(async (req, res) => {
  const assetId = assetIdParamSchema.parse(req.params.assetId);
  const asset = await assetRepository.findById(req.ctx!.tenantId, assetId);
  if (!asset) throw notFound('Asset');
  res.json({ asset });
}));

router.patch('/:assetId', requireMinimumRole('editor'), asyncHandler(async (req, res) => {
  const assetId = assetIdParamSchema.parse(req.params.assetId);
  assertWritablePayload(req.body as Record<string, unknown>);
  const body = parseBody(updateAssetSchema, req);
  const asset = await assetRepository.update(req.ctx!.tenantId, assetId, body);
  invalidateTenantAssetCaches(req.ctx!.tenantId);
  res.json({ asset });
}));

router.delete('/:assetId', requireMinimumRole('editor'), asyncHandler(async (req, res) => {
  const assetId = assetIdParamSchema.parse(req.params.assetId);
  await assetRepository.delete(req.ctx!.tenantId, assetId);
  invalidateTenantAssetCaches(req.ctx!.tenantId);
  res.status(204).send();
}));

export const assetRoutes = router;
