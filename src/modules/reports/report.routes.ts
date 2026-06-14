import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { cache } from '../../shared/cache.js';
import { notFound } from '../../shared/errors.js';
import { getRequestContext } from '../../shared/request-context-helpers.js';
import { AssetRepository } from '../assets/asset.repository.js';
import { TenantRepository } from '../tenants/tenant.repository.js';

const router = Router();
const tenantRepository = new TenantRepository();
const assetRepository = new AssetRepository();
const SUMMARY_CACHE_TTL_SECONDS = 45;

// Deduplicates concurrent DB hits after TTL expiry: the first miss starts the
// computation and stores the promise here; subsequent misses await the same
// promise instead of launching N parallel aggregations.
const inflight = new Map<string, Promise<AssetSummaryReport>>();

// X-Cache header signals whether the response was served from the in-process
// cache (HIT) or freshly computed from the database (MISS). Clients can use
// this header to detect stale data and decide whether to retry after a write.
const X_CACHE_HEADER = 'x-cache';
const X_CACHE_HIT = 'HIT';
const X_CACHE_MISS = 'MISS';

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
  const ctx = getRequestContext(req);
  const cacheKey = `tenant:${ctx.tenantId}:reports:assets-summary:v1`;
  const cached = cache.get<AssetSummaryReport>(cacheKey);
  if (cached) {
    res.setHeader(X_CACHE_HEADER, X_CACHE_HIT);
    res.json(cached);
    return;
  }

  let pending = inflight.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      try {
        const tenant = await tenantRepository.findById(ctx.tenantId);
        if (!tenant) throw notFound('Tenant');

        const summary = await assetRepository.summaryByTenant(ctx.tenantId);
        const report: AssetSummaryReport = {
          tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
          assets: summary,
          generated_at: new Date().toISOString()
        };
        cache.set(cacheKey, report, SUMMARY_CACHE_TTL_SECONDS);
        return report;
      } finally {
        inflight.delete(cacheKey);
      }
    })();
    inflight.set(cacheKey, pending);
  }

  const report = await pending;
  res.setHeader(X_CACHE_HEADER, X_CACHE_MISS);
  res.json(report);
}));

export const reportRoutes = router;
