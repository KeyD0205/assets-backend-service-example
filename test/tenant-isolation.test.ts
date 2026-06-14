import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { initMongo, closeMongo } from '../src/db/mongo.js';
import { pgPool } from '../src/db/postgres.js';

type TokenResponse = {
  access_token: string;
};

const app = buildApp();
const testPassword = 'password123';

type TenantResponse = {
  tenant: {
    id: string;
    slug: string;
  };
  admin: {
    id: string;
    email: string;
  };
};

async function getToken(email: string, tenant_slug: string): Promise<string> {
  const response = await request(app)
    .post('/v1/auth/tokens')
    .send({ email, tenant_slug, password: testPassword })
    .expect(200);
  return (response.body as TokenResponse).access_token;
}

async function createTenant(prefix: string): Promise<TenantResponse> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const slug = `${prefix}-${suffix}`;
  const response = await request(app)
    .post('/v1/tenants')
    .send({
      name: `QA ${prefix} ${suffix}`,
      slug,
      admin: {
        name: 'QA Admin',
        email: `admin-${prefix}-${suffix}@qa.test`,
        password: testPassword
      }
    })
    .expect(201);

  return response.body as TenantResponse;
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

  it('rejects token issuance for a valid user in the wrong tenant', async () => {
    await request(app)
      .post('/v1/auth/tokens')
      .send({
        email: 'amelia@northwind.test',
        tenant_slug: 'beacon-sensors',
        password: testPassword
      })
      .expect(401);
  });

  it('rejects missing and malformed bearer tokens', async () => {
    await request(app)
      .get('/v1/assets')
      .expect(401);

    await request(app)
      .get('/v1/assets')
      .set('Authorization', 'Bearer not-a-jwt')
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

  it('rejects invalid asset core fields', async () => {
    const token = await getToken('sam@northwind.test', 'northwind-utilities');

    const response = await request(app)
      .post('/v1/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'invalid-core-asset',
        type: 'sensor',
        status: 'offline',
        lat: 120,
        lng: -190,
        installed_at: '01-01-2026'
      })
      .expect(400);

    expect(response.body.error.code).toBe('validation_error');
    expect(response.body.error.details.map((detail: { field: string }) => detail.field)).toEqual(
      expect.arrayContaining(['status', 'lat', 'lng', 'installed_at'])
    );
  });

  it('rejects unsafe nested asset keys', async () => {
    const token = await getToken('sam@northwind.test', 'northwind-utilities');

    await request(app)
      .post('/v1/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'unsafe-asset',
        type: 'sensor',
        status: 'ok',
        lat: 42.36,
        lng: -71.09,
        installed_at: '2026-01-01',
        metadata: {
          '$where': 'this.status === "ok"'
        }
      })
      .expect(400);

    await request(app)
      .post('/v1/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'dotted-asset',
        type: 'sensor',
        status: 'ok',
        lat: 42.36,
        lng: -71.09,
        installed_at: '2026-01-01',
        metadata: {
          'profile.name': 'bad'
        }
      })
      .expect(400);
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

  it('supports tenant-scoped asset CRUD', async () => {
    const tenant = await createTenant('asset-crud');
    const token = await getToken(tenant.admin.email, tenant.tenant.slug);

    const created = await request(app)
      .post('/v1/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'QA Pump 1',
        type: 'pump',
        status: 'ok',
        lat: 40.7,
        lng: -74.0,
        installed_at: '2024-01-01',
        manufacturer: 'QA Works'
      })
      .expect(201);

    const assetId = created.body.asset.id as string;
    expect(created.body.asset.tenant_id).toBe(tenant.tenant.id);
    expect(created.body.asset.manufacturer).toBe('QA Works');

    const fetched = await request(app)
      .get(`/v1/assets/${assetId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(fetched.body.asset.name).toBe('QA Pump 1');

    const updated = await request(app)
      .patch(`/v1/assets/${assetId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'warning', service_window: 'night' })
      .expect(200);
    expect(updated.body.asset.status).toBe('warning');
    expect(updated.body.asset.service_window).toBe('night');

    await request(app)
      .delete(`/v1/assets/${assetId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(app)
      .get(`/v1/assets/${assetId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('filters and paginates assets within the caller tenant', async () => {
    const tenant = await createTenant('asset-list');
    const token = await getToken(tenant.admin.email, tenant.tenant.slug);

    const assets = [
      { name: 'Valve A', type: 'valve', status: 'ok', installed_at: '2024-01-01' },
      { name: 'Valve B', type: 'valve', status: 'warning', installed_at: '2024-01-02' },
      { name: 'Sensor C', type: 'sensor', status: 'warning', installed_at: '2024-01-03' }
    ];

    for (const asset of assets) {
      await request(app)
        .post('/v1/assets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...asset,
          lat: 35,
          lng: -80
        })
        .expect(201);
    }

    const warningResponse = await request(app)
      .get('/v1/assets?status=warning&limit=10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(warningResponse.body.data).toHaveLength(2);
    expect(warningResponse.body.data.every((asset: { status: string }) => asset.status === 'warning')).toBe(true);

    const valveResponse = await request(app)
      .get('/v1/assets?type=valve&limit=10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(valveResponse.body.data).toHaveLength(2);
    expect(valveResponse.body.data.every((asset: { type: string }) => asset.type === 'valve')).toBe(true);

    const firstPage = await request(app)
      .get('/v1/assets?limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(firstPage.body.data).toHaveLength(2);
    expect(firstPage.body.next_cursor).toEqual(expect.any(String));

    const secondPage = await request(app)
      .get(`/v1/assets?limit=2&cursor=${encodeURIComponent(firstPage.body.next_cursor as string)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(secondPage.body.data).toHaveLength(1);
    expect(secondPage.body.next_cursor).toBeNull();
  });

  it('invalidates tenant report cache after asset writes', async () => {
    const tenant = await createTenant('report-cache');
    const token = await getToken(tenant.admin.email, tenant.tenant.slug);

    const firstReport = await request(app)
      .get('/v1/reports/assets/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(firstReport.header['x-cache']).toBe('MISS');
    expect(firstReport.body.assets.total).toBe(0);

    const cachedReport = await request(app)
      .get('/v1/reports/assets/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(cachedReport.header['x-cache']).toBe('HIT');

    await request(app)
      .post('/v1/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Cache Test Sensor',
        type: 'sensor',
        status: 'critical',
        lat: 39,
        lng: -77,
        installed_at: '2024-03-01'
      })
      .expect(201);

    const refreshedReport = await request(app)
      .get('/v1/reports/assets/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(refreshedReport.header['x-cache']).toBe('MISS');
    expect(refreshedReport.body.assets.total).toBe(1);
    expect(refreshedReport.body.assets.by_status.critical).toBe(1);
  });

  it('allows admins to manage users inside their tenant', async () => {
    const tenant = await createTenant('user-admin');
    const adminToken = await getToken(tenant.admin.email, tenant.tenant.slug);
    const userEmail = `editor-${tenant.tenant.slug}@qa.test`;

    const created = await request(app)
      .post('/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'QA Editor',
        email: userEmail,
        password: testPassword,
        role: 'editor'
      })
      .expect(201);
    expect(created.body.user.email).toBe(userEmail);
    expect(created.body.user.role).toBe('editor');

    const userId = created.body.user.id as string;
    const updated = await request(app)
      .patch(`/v1/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'viewer', name: 'QA Viewer' })
      .expect(200);
    expect(updated.body.user.role).toBe('viewer');
    expect(updated.body.user.name).toBe('QA Viewer');

    await request(app)
      .delete(`/v1/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    await request(app)
      .get(`/v1/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('prevents non-admins from managing users', async () => {
    const tenant = await createTenant('user-role');
    const adminToken = await getToken(tenant.admin.email, tenant.tenant.slug);

    const created = await request(app)
      .post('/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'QA Editor',
        email: `editor-${tenant.tenant.slug}@qa.test`,
        password: testPassword,
        role: 'editor'
      })
      .expect(201);

    const editorToken = await getToken(created.body.user.email as string, tenant.tenant.slug);
    await request(app)
      .post('/v1/users')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        name: 'Unauthorized User',
        email: `unauthorized-${tenant.tenant.slug}@qa.test`,
        password: testPassword,
        role: 'viewer'
      })
      .expect(403);

    await request(app)
      .patch(`/v1/users/${created.body.user.id}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ role: 'viewer' })
      .expect(403);
  });

  it('protects self-delete and last-admin role changes', async () => {
    const tenant = await createTenant('last-admin');
    const adminToken = await getToken(tenant.admin.email, tenant.tenant.slug);

    await request(app)
      .delete(`/v1/users/${tenant.admin.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);

    await request(app)
      .patch(`/v1/users/${tenant.admin.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'viewer' })
      .expect(400);

    const secondAdmin = await request(app)
      .post('/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Second Admin',
        email: `second-admin-${tenant.tenant.slug}@qa.test`,
        password: testPassword,
        role: 'admin'
      })
      .expect(201);

    await request(app)
      .patch(`/v1/users/${secondAdmin.body.user.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'viewer' })
      .expect(200);
  });
});
