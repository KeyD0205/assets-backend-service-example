import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { initMongo, closeMongo } from '../src/db/mongo.js';
import { pgPool } from '../src/db/postgres.js';

const app = buildApp();
const testPassword = 'password123';

type TokenResponse = { access_token: string };
type TenantResponse = { tenant: { id: string; slug: string }; admin: { id: string; email: string } };

async function getToken(email: string, tenantSlug: string): Promise<string> {
  const res = await request(app)
    .post('/v1/auth/tokens')
    .send({ email, tenant_slug: tenantSlug, password: testPassword })
    .expect(200);
  return (res.body as TokenResponse).access_token;
}

async function createTenant(prefix: string): Promise<TenantResponse> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const slug = `${prefix}-${suffix}`;
  const res = await request(app)
    .post('/v1/tenants')
    .send({
      name: `QA ${prefix} ${suffix}`,
      slug,
      admin: { name: 'QA Admin', email: `admin-${slug}@qa.test`, password: testPassword }
    })
    .expect(201);
  return res.body as TenantResponse;
}

beforeAll(async () => {
  await pgPool.query('SELECT 1');
  await initMongo();
});

afterAll(async () => {
  await closeMongo();
  await pgPool.end();
});

describe('health check', () => {
  it('returns 200 with both databases healthy', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.postgres).toBe('ok');
    expect(res.body.checks.mongodb).toBe('ok');
  });
});

describe('body size limits', () => {
  it('returns 413 payload_too_large when asset body exceeds limit', async () => {
    const tenant = await createTenant('body-limit');
    const token = await getToken(tenant.admin.email, tenant.tenant.slug);
    const res = await request(app)
      .post('/v1/assets')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({
        name: 'big',
        type: 'sensor',
        status: 'ok',
        lat: 0,
        lng: 0,
        installed_at: '2024-01-01',
        data: 'x'.repeat(600_000)
      }))
      .expect(413);
    expect(res.body.error.code).toBe('payload_too_large');
  });
});

describe('pagination cursor edge cases', () => {
  it('returns 400 bad_request on a tampered cursor', async () => {
    const token = await getToken('amelia@northwind.test', 'northwind-utilities');
    const res = await request(app)
      .get('/v1/assets?cursor=not-valid-base64url!!!')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(res.body.error.code).toBe('bad_request');
  });

  it('returns 400 bad_request on a base64url cursor that is not valid JSON', async () => {
    const token = await getToken('amelia@northwind.test', 'northwind-utilities');
    const badCursor = Buffer.from('not-json', 'utf8').toString('base64url');
    const res = await request(app)
      .get(`/v1/assets?cursor=${badCursor}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(res.body.error.code).toBe('bad_request');
  });
});

describe('auth edge cases', () => {
  it('returns 400 when both tenant_slug and tenant_id are provided', async () => {
    const res = await request(app)
      .post('/v1/auth/tokens')
      .send({
        email: 'amelia@northwind.test',
        tenant_slug: 'northwind-utilities',
        tenant_id: '11111111-1111-4111-8111-111111111111',
        password: testPassword
      })
      .expect(400);
    expect(res.body.error.code).toBe('validation_error');
  });
});

describe('GET /v1/tenants/me', () => {
  it('returns the authenticated tenant', async () => {
    const token = await getToken('amelia@northwind.test', 'northwind-utilities');
    const res = await request(app)
      .get('/v1/tenants/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.tenant.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(res.body.tenant.slug).toBe('northwind-utilities');
  });

  it('returns 401 without a token', async () => {
    await request(app).get('/v1/tenants/me').expect(401);
  });
});

describe('asset 404 paths', () => {
  it('returns 404 on PATCH with a non-existent asset id', async () => {
    const tenant = await createTenant('asset-404');
    const token = await getToken(tenant.admin.email, tenant.tenant.slug);
    await request(app)
      .patch('/v1/assets/00000000-0000-4000-8000-000000000099')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'warning' })
      .expect(404);
  });

  it('returns 404 on DELETE with a non-existent asset id', async () => {
    const tenant = await createTenant('asset-del-404');
    const token = await getToken(tenant.admin.email, tenant.tenant.slug);
    await request(app)
      .delete('/v1/assets/00000000-0000-4000-8000-000000000099')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});

describe('duplicate detection', () => {
  it('returns 409 on duplicate user email within a tenant', async () => {
    const tenant = await createTenant('dup-email');
    const token = await getToken(tenant.admin.email, tenant.tenant.slug);
    const payload = {
      name: 'Dup User',
      email: `dup-${tenant.tenant.slug}@qa.test`,
      password: testPassword,
      role: 'viewer'
    };
    await request(app)
      .post('/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);
    const res = await request(app)
      .post('/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(409);
    expect(res.body.error.code).toBe('conflict');
  });

  it('returns 409 on duplicate tenant slug', async () => {
    const first = await createTenant('dup-slug');
    const res = await request(app)
      .post('/v1/tenants')
      .send({
        name: 'Duplicate Slug Tenant',
        slug: first.tenant.slug,
        admin: { name: 'Admin', email: `admin2-${first.tenant.slug}@qa.test`, password: testPassword }
      })
      .expect(409);
    expect(res.body.error.code).toBe('conflict');
  });
});
