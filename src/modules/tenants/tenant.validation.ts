import { z } from 'zod';

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens').min(2).max(80),
  admin: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().transform(value => value.toLowerCase()),
    password: z.string().min(8).max(128)
  })
});
