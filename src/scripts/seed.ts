import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgPool } from '../db/postgres.js';
import { assetsCollection, initMongo, closeMongo, type AssetDocument } from '../db/mongo.js';
import { env } from '../config/env.js';
import { logger } from '../shared/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

type SeedAsset = {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  status: 'ok' | 'warning' | 'critical';
  lat: number;
  lng: number;
  installed_at: string;
  [key: string]: unknown;
};

async function seedPostgres(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to run destructive seed script in production.');
  }

  const sqlPath = path.join(rootDir, 'data', 'tenants.seed.sql');
  const seedSql = await readFile(sqlPath, 'utf8');

  await pgPool.query('DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS tenants CASCADE;');
  await pgPool.query(seedSql);
  logger.info('Seeded PostgreSQL tenants and users');
}

async function seedMongo(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to run destructive seed script in production.');
  }

  await initMongo();
  const jsonPath = path.join(rootDir, 'data', 'assets.seed.json');
  const seedAssets = JSON.parse(await readFile(jsonPath, 'utf8')) as SeedAsset[];
  const tenantIds = [...new Set(seedAssets.map(asset => asset.tenant_id))];
  const now = new Date().toISOString();

  await assetsCollection().deleteMany({ tenant_id: { $in: tenantIds } });
  if (seedAssets.length > 0) {
    const docs: AssetDocument[] = seedAssets.map(asset => ({
      ...asset,
      _id: `${asset.tenant_id}:${asset.id}`,
      created_at: now,
      updated_at: now
    }));
    await assetsCollection().insertMany(docs);
  }

  logger.info({ count: seedAssets.length }, 'Seeded MongoDB assets');
}

async function main(): Promise<void> {
  await seedPostgres();
  await seedMongo();
}

void main()
  .catch(err => {
    logger.error({ err }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await pgPool.end();
    await closeMongo();
  });
