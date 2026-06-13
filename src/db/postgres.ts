import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../shared/logger.js';

export const pgPool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 15_000
});

pgPool.on('error', err => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
});

export async function closePostgres(): Promise<void> {
  await pgPool.end();
}
