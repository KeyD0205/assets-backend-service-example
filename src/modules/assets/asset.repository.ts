import { randomUUID } from 'node:crypto';
import type { Filter, UpdateFilter } from 'mongodb';
import { assetsCollection, type AssetDocument } from '../../db/mongo.js';
import { conflict, notFound } from '../../shared/errors.js';
import { encodeCursor, type Page } from '../../shared/pagination.js';

type ListFilters = {
  type?: string;
  status?: 'ok' | 'warning' | 'critical';
  limit: number;
  cursor?: { installed_at: string; id: string };
};

export function sanitizeAsset(doc: AssetDocument): Omit<AssetDocument, '_id'> {
  const { _id: _ignored, ...publicDoc } = doc;
  return publicDoc;
}

export class AssetRepository {
  async listByTenant(tenantId: string, filters: ListFilters): Promise<Page<Omit<AssetDocument, '_id'>>> {
    const query: Filter<AssetDocument> = { tenant_id: tenantId };
    if (filters.type) query.type = filters.type;
    if (filters.status) query.status = filters.status;
    if (filters.cursor) {
      query.$or = [
        { installed_at: { $lt: filters.cursor.installed_at } },
        { installed_at: filters.cursor.installed_at, id: { $gt: filters.cursor.id } }
      ];
    }

    const docs = await assetsCollection()
      .find(query)
      .sort({ installed_at: -1, id: 1 })
      .limit(filters.limit + 1)
      .toArray();

    const page = docs.slice(0, filters.limit).map(sanitizeAsset);
    const next = docs.length > filters.limit ? page.at(-1) : undefined;

    return {
      data: page,
      next_cursor: next ? encodeCursor({ installed_at: next.installed_at, id: next.id }) : null
    };
  }

  async findById(tenantId: string, assetId: string): Promise<Omit<AssetDocument, '_id'> | null> {
    const doc = await assetsCollection().findOne({ tenant_id: tenantId, id: assetId });
    return doc ? sanitizeAsset(doc) : null;
  }

  async create(tenantId: string, payload: Record<string, unknown>): Promise<Omit<AssetDocument, '_id'>> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const doc = {
      ...payload,
      _id: `${tenantId}:${id}`,
      id,
      tenant_id: tenantId,
      created_at: now,
      updated_at: now
    } as AssetDocument;

    try {
      await assetsCollection().insertOne(doc);
      return sanitizeAsset(doc);
    } catch (err) {
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
        throw conflict('Asset id already exists in this tenant');
      }
      throw err;
    }
  }

  async update(tenantId: string, assetId: string, patch: Record<string, unknown>): Promise<Omit<AssetDocument, '_id'>> {
    const update: UpdateFilter<AssetDocument> = {
      $set: {
        ...patch,
        updated_at: new Date().toISOString()
      }
    };
    const result = await assetsCollection().findOneAndUpdate(
      { tenant_id: tenantId, id: assetId },
      update,
      { returnDocument: 'after' }
    );
    if (!result) throw notFound('Asset');
    return sanitizeAsset(result);
  }

  async delete(tenantId: string, assetId: string): Promise<void> {
    const result = await assetsCollection().deleteOne({ tenant_id: tenantId, id: assetId });
    if (result.deletedCount === 0) throw notFound('Asset');
  }

  async summaryByTenant(tenantId: string): Promise<{
    total: number;
    by_status: Record<string, number>;
    by_type: Record<string, number>;
    newest_installed_at: string | null;
    oldest_installed_at: string | null;
  }> {
    const [result] = await assetsCollection().aggregate<{
      total: Array<{ count: number }>;
      by_status: Array<{ _id: string; count: number }>;
      by_type: Array<{ _id: string; count: number }>;
      bounds: Array<{ newest_installed_at: string; oldest_installed_at: string }>;
    }>([
      { $match: { tenant_id: tenantId } },
      {
        $facet: {
          total: [{ $count: 'count' }],
          by_status: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          by_type: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
          bounds: [
            {
              $group: {
                _id: null,
                newest_installed_at: { $max: '$installed_at' },
                oldest_installed_at: { $min: '$installed_at' }
              }
            }
          ]
        }
      }
    ]).toArray();

    const byStatus = Object.fromEntries((result?.by_status ?? []).map(item => [item._id, item.count]));
    const byType = Object.fromEntries((result?.by_type ?? []).map(item => [item._id, item.count]));
    const bounds = result?.bounds?.[0];

    return {
      total: result?.total?.[0]?.count ?? 0,
      by_status: byStatus,
      by_type: byType,
      newest_installed_at: bounds?.newest_installed_at ?? null,
      oldest_installed_at: bounds?.oldest_installed_at ?? null
    };
  }
}
