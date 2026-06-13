import { z } from 'zod';

export const assetStatusSchema = z.enum(['ok', 'warning', 'critical']);

export const assetCoreSchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.string().trim().min(1).max(80),
  status: assetStatusSchema,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  installed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
});

export const createAssetSchema = assetCoreSchema.passthrough();

export const updateAssetSchema = assetCoreSchema.partial().passthrough().refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided'
});

export const listAssetQuerySchema = z.object({
  type: z.string().trim().min(1).max(80).optional(),
  status: assetStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional()
});

export const assetCursorSchema = z.object({
  installed_at: z.string(),
  id: z.string().uuid()
});

const forbiddenFields = new Set(['id', '_id', 'tenant_id', 'created_at', 'updated_at', 'deleted_at']);

function collectUnsafeKeys(value: unknown, path: string[] = []): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];

  const unsafe: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const fieldPath = [...path, key].join('.');
    if (forbiddenFields.has(key) && path.length === 0) unsafe.push(fieldPath);
    if (key.startsWith('$') || key.includes('.')) unsafe.push(fieldPath);
    unsafe.push(...collectUnsafeKeys(child, [...path, key]));
  }
  return unsafe;
}

export function assertNoProtectedAssetFields(payload: Record<string, unknown>): void {
  const unsafe = [...new Set(collectUnsafeKeys(payload))];
  if (unsafe.length > 0) {
    throw new Error(`Unsafe or protected asset fields are not writable: ${unsafe.join(', ')}`);
  }
}
