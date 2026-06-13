import { z } from 'zod';
import { roles } from '../../shared/roles.js';

export const userCursorSchema = z.object({
  created_at: z.string().datetime(),
  id: z.string().uuid()
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().transform(value => value.toLowerCase()),
  password: z.string().min(8).max(128),
  role: z.enum(roles)
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().transform(value => value.toLowerCase()).optional(),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(roles).optional()
}).strict().refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided'
});
