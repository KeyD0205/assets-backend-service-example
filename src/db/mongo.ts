import { MongoClient, type Collection, type Db } from 'mongodb';
import { env } from '../config/env.js';
import { logger } from '../shared/logger.js';

export type AssetDocument = {
  _id: string;
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  status: 'ok' | 'warning' | 'critical';
  lat: number;
  lng: number;
  installed_at: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};

let client: MongoClient | undefined;
let db: Db | undefined;

export async function initMongo(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(env.MONGO_URL, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5_000
  });
  await client.connect();
  db = client.db(env.MONGO_DB_NAME);
  await ensureMongoIndexes();
  logger.info({ dbName: env.MONGO_DB_NAME }, 'Connected to MongoDB');
  return db;
}

export function mongoDb(): Db {
  if (!db) {
    throw new Error('MongoDB is not initialized. Call initMongo() first.');
  }
  return db;
}

export function assetsCollection(): Collection<AssetDocument> {
  return mongoDb().collection<AssetDocument>('assets');
}

export async function ensureMongoIndexes(): Promise<void> {
  const collection = mongoDb().collection<AssetDocument>('assets');
  await Promise.all([
    collection.createIndex({ tenant_id: 1, id: 1 }, { unique: true, name: 'uniq_assets_tenant_id_id' }),
    collection.createIndex({ tenant_id: 1, type: 1, installed_at: -1, id: 1 }, { name: 'idx_assets_tenant_type_installed_id' }),
    collection.createIndex({ tenant_id: 1, status: 1, installed_at: -1, id: 1 }, { name: 'idx_assets_tenant_status_installed_id' }),
    collection.createIndex({ tenant_id: 1, type: 1, status: 1, installed_at: -1, id: 1 }, { name: 'idx_assets_tenant_type_status_installed_id' }),
    collection.createIndex({ tenant_id: 1, installed_at: -1, id: 1 }, { name: 'idx_assets_tenant_installed_id' })
  ]);
}

export async function closeMongo(): Promise<void> {
  await client?.close();
  client = undefined;
  db = undefined;
}

export async function pingMongo(): Promise<void> {
  await mongoDb().command({ ping: 1 });
}
