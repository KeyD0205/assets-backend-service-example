import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { cache } from '../../shared/cache.js';
import { notFound } from '../../shared/errors.js';
import { AssetRepository } from '../assets/asset.repository.js';
import { TenantRepository } from '../tenants/tenant.repository.js';

const router = Router();
const tenantRepository = new TenantRepository();
const assetRepository = new AssetRepository();
const SUMMARY_CACHE_TTL_SECONDS = 45;

type AssetSummaryReport = {
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  assets: Awaited<ReturnType<AssetRepository['summaryByTenant']>>;
  generated_at: string;
};

router.use(authenticate);

router.get('/assets/summary', asyncHandler(async (req, res) => {
  const cacheKey = `tenant:${req.ctx!.tenantId}:reports:assets-summary:v1`;
  const cached = cache.get<AssetSummaryReport>(cacheKey);
  if (cached) {
    res.setHeader('x-cache', 'HIT');
    res.json(cached);
    return;
  }

  const tenant = await tenantRepository.findById(req.ctx!.tenantId);
  if (!tenant) throw notFound('Tenant');

  const summary = await assetRepository.summaryByTenant(req.ctx!.tenantId);
  const report: AssetSummaryReport = {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug
    },
    assets: summary,
    generated_at: new Date().toISOString()
  };

  cache.set(cacheKey, report, SUMMARY_CACHE_TTL_SECONDS);
  res.setHeader('x-cache', 'MISS');
  res.json(report);
}));

export const reportRoutes = router;
