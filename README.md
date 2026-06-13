# Multi-tenant Asset Service

A backend implementation for the technical assignment: Node.js / Express / TypeScript, PostgreSQL for tenant identity data, and MongoDB for flexible tenant-scoped asset documents.

## Design summary

The service uses Postgres for data that benefits from relational constraints: tenants, users, credential hashes, and roles. The provided relational seed file creates `tenants` and `users`, enforces a single role per user, and includes a tenant-scoped unique email constraint.

MongoDB stores assets because assets share a common core shape but each tenant can add different fields. The service validates the core shape strictly and allows tenant-specific extensions while rejecting protected fields such as `tenant_id`, `id`, `_id`, and timestamps.

Tenant isolation is enforced by the auth middleware and repository contracts:

- Every authenticated request resolves a server-side `RequestContext` containing `tenantId`, `userId`, and `role`.
- All Postgres user queries include `tenant_id`.
- All Mongo asset queries include `tenant_id`.
- Cross-tenant asset lookups return `404`, not `403`, to avoid leaking resource existence.

## Requirements covered

- Tenant onboarding with initial admin user.
- Tenant-scoped user management.
- Simple bearer-token auth.
- Tenant-scoped asset CRUD.
- Asset filtering by `type` and `status`.
- Cursor pagination for list endpoints.
- Cross-store report combining Postgres tenant metadata and Mongo asset aggregates.
- Mongo indexes mapped to exposed queries.
- Postgres uniqueness and tenant indexes.
- Seed script for Postgres and Mongo.
- Focused integration tests around tenant isolation and authorization.
- Optional in-process TTL cache for the report endpoint, invalidated on asset writes.

## Running locally

```bash
cp .env.example .env
npm install
npm run db:up
npm run seed
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

Get a token:

```bash
curl -s -X POST http://localhost:3000/v1/auth/tokens \
  -H 'content-type: application/json' \
  -d '{"email":"amelia@northwind.test","password":"password123","tenant_slug":"northwind-utilities"}'
```

Use the returned token:

```bash
TOKEN="paste-token-here"

curl http://localhost:3000/v1/assets?status=warning\&limit=10 \
  -H "authorization: Bearer $TOKEN"
```

## API overview

### Auth

```http
POST /v1/auth/tokens
```

Request:

```json
{
  "email": "amelia@northwind.test",
  "password": "password123",
  "tenant_slug": "northwind-utilities"
}
```

Response:

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "...",
    "name": "Amelia Chen",
    "email": "amelia@northwind.test",
    "role": "admin",
    "created_at": "2024-01-15T10:00:00.000Z"
  }
}
```

### Tenants

```http
POST /v1/tenants
GET  /v1/tenants/me
```

Onboarding request:

```json
{
  "name": "Acme Utilities",
  "slug": "acme-utilities",
  "admin": {
    "name": "Alex Admin",
    "email": "alex@acme.test",
    "password": "change-me-please"
  }
}
```

### Users

```http
GET    /v1/users?limit=25&cursor=...
POST   /v1/users
GET    /v1/users/:userId
PATCH  /v1/users/:userId
DELETE /v1/users/:userId
```

Admin role is required for create/update/delete. The service blocks self-delete and prevents deleting or demoting the last tenant admin.

### Assets

```http
GET    /v1/assets?type=pipe&status=warning&limit=25&cursor=...
POST   /v1/assets
GET    /v1/assets/:assetId
PATCH  /v1/assets/:assetId
DELETE /v1/assets/:assetId
```

Create request:

```json
{
  "name": "NWU-P-0101",
  "type": "pipe",
  "status": "ok",
  "lat": 42.36,
  "lng": -71.09,
  "installed_at": "2026-01-01",
  "material": "copper",
  "diameter_mm": 250
}
```

The server injects `tenant_id` from the bearer token. Client-provided protected fields are rejected.

### Reports

```http
GET /v1/reports/assets/summary
```

Response:

```json
{
  "tenant": {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "Northwind Utilities",
    "slug": "northwind-utilities"
  },
  "assets": {
    "total": 100,
    "by_status": {
      "ok": 70,
      "warning": 20,
      "critical": 10
    },
    "by_type": {
      "pipe": 40,
      "valve": 25,
      "hydrant": 25,
      "sensor": 10
    },
    "newest_installed_at": "2025-09-10",
    "oldest_installed_at": "1995-01-07"
  },
  "generated_at": "2026-06-13T08:00:00.000Z"
}
```

## Error contract

```json
{
  "error": {
    "code": "validation_error",
    "message": "Invalid request",
    "details": [
      { "field": "status", "message": "Invalid enum value" }
    ],
    "request_id": "..."
  }
}
```

## Indexes

MongoDB indexes are created on startup and during seeding:

```js
db.assets.createIndex({ tenant_id: 1, id: 1 }, { unique: true })
db.assets.createIndex({ tenant_id: 1, type: 1, status: 1, id: 1 })
db.assets.createIndex({ tenant_id: 1, status: 1 })
db.assets.createIndex({ tenant_id: 1, installed_at: -1, id: 1 })
```

Postgres constraints and indexes are defined by `data/tenants.seed.sql`, including tenant primary keys, tenant slug uniqueness, user tenant foreign key, role check, tenant-scoped unique email, password hashes, and `idx_users_tenant_id`.

## Tests

Run the databases and seed before tests:

```bash
npm run db:up
npm run seed
npm test
```

The tests focus on the highest-risk behavior:

- asset lists only include the caller tenant;
- cross-tenant asset IDs return `404`;
- client-supplied `tenant_id` is rejected;
- viewers cannot mutate assets;
- report aggregation is scoped to the caller tenant.

## Notes and trade-offs

- Authentication is intentionally simple because OAuth/SSO is out of scope. Users authenticate with email, tenant, and password. Tokens are signed JWTs, but role and tenant membership are loaded from Postgres on every request so user changes take effect immediately.
- Asset documents are flexible, but ownership and identity fields are immutable from API input.
- Reports are eventually consistent with respect to cache TTL. Asset writes invalidate the current tenant's report cache.
- The seed script is intentionally destructive and refuses to run in production.
