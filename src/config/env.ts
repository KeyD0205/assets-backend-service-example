import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().url().default('postgres://postgres:postgres@localhost:5432/assetsvc'),
  MONGO_URL: z.string().url().default('mongodb://localhost:27017'),
  MONGO_DB_NAME: z.string().min(1).default('assetsvc'),
  JWT_SECRET: z.string().min(32).default('local-development-secret-change-me-32chars'),
  TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
  CORS_ORIGIN: z.string().default('*'),
  ENABLE_RATE_LIMIT: z.coerce.boolean().default(false)
});

export const env = envSchema.parse(process.env);

if (env.NODE_ENV === 'production' && env.JWT_SECRET.includes('change-me')) {
  throw new Error('JWT_SECRET must be set to a strong secret in production.');
}
