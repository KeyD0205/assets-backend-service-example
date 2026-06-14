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
  JWT_ISSUER: z.string().min(1).default('multi-tenant-asset-service'),
  JWT_AUDIENCE: z.string().min(1).default('asset-service-api'),
  TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
  CORS_ORIGIN: z.string().default('*'),
  ENABLE_RATE_LIMIT: z.coerce.boolean().default(true),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10)
});

export const env = envSchema.parse(process.env);

const placeholderMarkers = ['change-me', 'replace-this'];

if (placeholderMarkers.some(m => env.JWT_SECRET.toLowerCase().includes(m))) {
  if (env.NODE_ENV !== 'development') {
    throw new Error('JWT_SECRET must not be a placeholder value outside of development.');
  }
}

if (env.NODE_ENV === 'production' && env.CORS_ORIGIN === '*') {
  throw new Error('CORS_ORIGIN must not be wildcard (*) in production.');
}
