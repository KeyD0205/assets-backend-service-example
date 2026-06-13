import { env } from './config/env.js';
import { initMongo } from './db/mongo.js';
import { pgPool } from './db/postgres.js';
import { buildApp } from './app.js';
import { logger } from './shared/logger.js';

async function main(): Promise<void> {
  await pgPool.query('SELECT 1');
  await initMongo();

  const app = buildApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Asset service listening');
  });

  const shutdown = () => {
    logger.info('Shutting down');
    server.close(err => {
      if (err) {
        logger.error({ err }, 'Failed to stop HTTP server cleanly');
        process.exit(1);
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

void main().catch(err => {
  logger.error({ err }, 'Failed to start service');
  process.exit(1);
});
