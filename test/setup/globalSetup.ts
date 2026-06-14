import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { Document } from 'mongodb';
import { MongoClient } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:5432/assetsvc';
const MONGO_URL = process.env['MONGO_URL'] ?? 'mongodb://localhost:27017';
const MONGO_DB_NAME = process.env['MONGO_DB_NAME'] ?? 'assetsvc';

type SeedAsset = {
  id: string;
  tenant_id: string;
  [key: string]: unknown;
};

export async function setup(): Promise<void> {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    const sqlPath = path.join(rootDir, 'data', 'tenants.seed.sql');
    const seedSql = await readFile(sqlPath, 'utf8');
    await pool.query('DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS tenants CASCADE;');
    await pool.query(seedSql);
  } finally {
    await pool.end();
  }

  const client = new MongoClient(MONGO_URL);
  try {
    await client.connect();
    const db = client.db(MONGO_DB_NAME);
    const jsonPath = path.join(rootDir, 'data', 'assets.seed.json');
    const seedAssets = JSON.parse(await readFile(jsonPath, 'utf8')) as SeedAsset[];
    const tenantIds = [...new Set(seedAssets.map(a => a.tenant_id))];
    const now = new Date().toISOString();

    await db.collection('assets').deleteMany({ tenant_id: { $in: tenantIds } });
    if (seedAssets.length > 0) {
      const docs = seedAssets.map(asset => ({
        ...asset,
        _id: `${asset.tenant_id}:${asset.id}`,
        created_at: now,
        updated_at: now
      }));
      await db.collection('assets').insertMany(docs as Document[]);
    }
  } finally {
    await client.close();
  }
}
