import { z } from 'zod';

export const createTokenSchema = z.object({
  email: z.string().email().transform(value => value.toLowerCase()),
  password: z.string().min(8).max(128),
  tenant_slug: z.string().min(1).max(80).optional(),
  tenant_id: z.string().uuid().optional()
}).refine(data => !(data.tenant_slug && data.tenant_id), {
  message: 'Provide either tenant_slug or tenant_id, not both',
  path: ['tenant_slug']
});
