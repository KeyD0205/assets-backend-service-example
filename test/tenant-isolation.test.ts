import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { initMongo, closeMongo } from '../src/db/mongo.js';
import { pgPool } from '../src/db/postgres.js';

type TokenResponse = {
  access_token: string;
};

const app = buildApp();

async function getToken(email: string, tenant_slug: string): Promise<string> {
  const response = await request(app)
    .post('/v1/auth/tokens')
    .send({ email, tenant_slug, password: 'password123' })
    .expect(201);
  return (response.body as TokenResponse).access_token;
}

beforeAll(async () => {
  await pgPool.query('SELECT 1');
  await initMongo();
});

afterAll(async () => {
  await closeMongo();
  await pgPool.end();
});

describe('tenant isolation and authorization', () => {
  it('rejects token issuance with an invalid password', async () => {
    await request(app)
      .post('/v1/auth/tokens')
      .send({
        email: 'amelia@northwind.test',
        tenant_slug: 'northwind-utilities',
        password: 'wrong-password'
      })
      .expect(401);
  });

  it('lists only the calling tenant assets', async () => {
    const token = await getToken('amelia@northwind.test', 'northwind-utilities');

    const response = await request(app)
      .get('/v1/assets?limit=100')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data.every((asset: { tenant_id: string }) => (
      asset.tenant_id === '11111111-1111-4111-8111-111111111111'
    ))).toBe(true);
  });

  it('returns 404 instead of leaking cross-tenant asset existence', async () => {
    const northwindToken = await getToken('amelia@northwind.test', 'northwind-utilities');
    const beaconAssetId = 'aab612c9-415d-474a-b5a6-69814104a8b5';

    await request(app)
      .get(`/v1/assets/${beaconAssetId}`)
      .set('Authorization', `Bearer ${northwindToken}`)
      .expect(404);
  });

  it('rejects client-supplied tenant_id on asset create', async () => {
    const token = await getToken('sam@northwind.test', 'northwind-utilities');

    const response = await request(app)
      .post('/v1/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tenant_id: '22222222-2222-4222-8222-222222222222',
        name: 'bad-cross-tenant-create',
        type: 'sensor',
        status: 'ok',
        lat: 42.36,
        lng: -71.09,
        installed_at: '2026-01-01'
      })
      .expect(400);

    expect(response.body.error.code).toBe('bad_request');
  });

  it('prevents viewers from mutating assets', async () => {
    const viewerToken = await getToken('declan@northwind.test', 'northwind-utilities');

    await request(app)
      .post('/v1/assets')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        name: 'viewer-created-asset',
        type: 'sensor',
        status: 'ok',
        lat: 42.36,
        lng: -71.09,
        installed_at: '2026-01-01'
      })
      .expect(403);
  });

  it('scopes cross-store reports to the authenticated tenant', async () => {
    const token = await getToken('cora@beacon.test', 'beacon-sensors');

    const response = await request(app)
      .get('/v1/reports/assets/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.tenant.id).toBe('22222222-2222-4222-8222-222222222222');
    expect(response.body.assets.total).toBeGreaterThan(0);
  });
});
