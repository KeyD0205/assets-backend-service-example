import { env } from './config/env.js';
import { initMongo, closeMongo } from './db/mongo.js';
import { pgPool, closePostgres } from './db/postgres.js';
import { buildApp } from './app.js';
import { logger } from './shared/logger.js';

async function main(): Promise<void> {
  await pgPool.query('SELECT 1');
  await initMongo();

  const app = buildApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Asset service listening');
  });

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down');
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
    await Promise.allSettled([closePostgres(), closeMongo()]);
    process.exit(0);
  };

  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
}

void main().catch(err => {
  logger.error({ err }, 'Failed to start service');
  process.exit(1);
});
