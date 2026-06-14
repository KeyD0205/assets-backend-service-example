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

## Architecture

```mermaid
flowchart TD
    Client(["HTTP Client"])

    subgraph "Request pipeline (every request)"
        MW["requestId -> requestLogger -> helmet -> cors\nhttpsEnforcement -> bodyLimiter -> inputSanitization"]
    end

    subgraph "Public - before global rate limit"
        HEALTH["GET /health"]
        CSP["POST /security/csp-report - 30 rpm"]
    end

    RL["Global rate limit · 300 rpm per IP"]

    subgraph "Unauthenticated"
        AT["POST /v1/auth/tokens"]
        TC["POST /v1/tenants · 10 rpm"]
    end

    subgraph "Authenticated (JWT Bearer + RBAC)"
        AUTH["authenticate middleware\n(verifies JWT, resolves cached user context)"]
        ROLE["requireRole - admin / editor / viewer"]

        subgraph "Resource modules"
            USERS["GET|POST /v1/users\nGET|PATCH|DELETE /v1/users/:id"]
            ASSETS["GET|POST /v1/assets\nGET|PATCH|DELETE /v1/assets/:id"]
            TM["GET /v1/tenants/me"]
            REPORT["GET /v1/reports/assets/summary\nTtlCache - 45 s"]
        end
    end

    subgraph "Data stores"
        PG[("PostgreSQL\ntenants · users")]
        MDB[("MongoDB\nassets")]
        CACHE["TtlCache\n(in-process)"]
    end

    Client --> MW
    MW --> HEALTH & CSP & RL
    RL --> AT & TC & AUTH
    AUTH --> ROLE --> USERS & ASSETS & TM & REPORT

    AT --> PG
    TC --> PG
    USERS --> PG
    TM --> PG
    ASSETS --> MDB
    REPORT -->|"cache miss"| MDB & PG
    REPORT -->|"cache hit"| CACHE
```

### Multi-tenant data model

```mermaid
erDiagram
    TENANT {
        uuid      id          PK
        text      name
        text      slug        "unique"
        timestamp created_at
    }
    USER {
        uuid      id          PK
        uuid      tenant_id   FK
        text      name
        text      email       "unique per tenant"
        text      password_hash
        text      role        "admin | editor | viewer"
        timestamp created_at
    }
    ASSET {
        string    _id         PK  "tenant_id:id"
        uuid      tenant_id
        uuid      id
        text      name
        text      type
        text      status      "ok | warning | critical"
        float     lat
        float     lng
        date      installed_at
        timestamp created_at
        timestamp updated_at
    }

    TENANT ||--o{ USER  : "has"
    TENANT ||--o{ ASSET : "owns"
```

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
- Focused unit and integration tests around tenant isolation, authorization, validation, pagination, caching, and sanitization.
- Optional in-process TTL cache for the report endpoint, invalidated on asset writes.

## Running locally

```bash
cp .env.example .env
npm ci
npm run db:up
npm run seed
npm run dev
```

If `5432` or `27017` is already in use, change `POSTGRES_PORT` or `MONGO_PORT` in `.env` before running `npm run db:up`, and update `DATABASE_URL` or `MONGO_URL` to match.

To stop the databases without deleting data, run `npm run db:down`. To remove database volumes and start from a clean slate, run `npm run db:reset`.

To run the same post-install checks as CI after the databases are up, use:

```bash
npm run verify
```

Health check:

```bash
curl http://localhost:3000/health
```

The health response verifies both backing stores and includes connection-pool and uptime details:

```json
{
  "status": "ok",
  "checks": {
    "postgres": "ok",
    "mongodb": "ok"
  },
  "pool": {
    "total": 1,
    "idle": 1,
    "waiting": 0
  },
  "uptime_seconds": 12
}
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

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | `development` \| `test` \| `production` |
| `PORT` | No | `3000` | HTTP listen port |
| `DATABASE_URL` | No | `postgres://postgres:postgres@localhost:5432/assetsvc` | PostgreSQL connection string |
| `MONGO_URL` | No | `mongodb://localhost:27017` | MongoDB connection string |
| `MONGO_DB_NAME` | No | `assetsvc` | MongoDB database name |
| `JWT_SECRET` | Outside development | *(dev placeholder)* | Minimum 32-character signing secret. Placeholder values containing `change-me` or `replace-this` are rejected outside development. |
| `JWT_ISSUER` | No | `multi-tenant-asset-service` | JWT `iss` claim |
| `JWT_AUDIENCE` | No | `asset-service-api` | JWT `aud` claim |
| `TOKEN_TTL_SECONDS` | No | `3600` | JWT lifetime in seconds (60–86400) |
| `CORS_ORIGIN` | No | `*` | Allowed CORS origin. Wildcard is rejected in production. |
| `ENABLE_RATE_LIMIT` | No | `true` | Global rate limiter toggle. Per-route limiters (auth, tenants, CSP) are always active. |
| `DB_POOL_MAX` | No | `10` | Maximum PostgreSQL pool connections |

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

The response includes `x-cache: HIT` or `x-cache: MISS` to show whether the tenant-scoped in-process cache served the report.

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
db.assets.createIndex({ tenant_id: 1, type: 1, installed_at: -1, id: 1 })
db.assets.createIndex({ tenant_id: 1, status: 1, installed_at: -1, id: 1 })
db.assets.createIndex({ tenant_id: 1, type: 1, status: 1, installed_at: -1, id: 1 })
db.assets.createIndex({ tenant_id: 1, installed_at: -1, id: 1 })
```

Postgres constraints and indexes are defined by `data/tenants.seed.sql`, including tenant primary keys, tenant slug uniqueness, user tenant foreign key, role check, tenant-scoped unique email, password hashes, `idx_users_tenant_id`, and `idx_users_tenant_created_id`.

## Tests

Run the databases and seed before tests:

```bash
npm run db:up
npm run verify
```

The tests focus on the highest-risk behavior:

- asset lists only include the caller tenant;
- cross-tenant asset IDs return `404`;
- client-supplied `tenant_id` is rejected;
- viewers cannot mutate assets;
- report aggregation is scoped to the caller tenant;
- auth and API edge cases return the expected errors;
- asset validation rejects unsafe payloads;
- pagination, cache, password, and input-sanitization helpers behave predictably.

## Notes and trade-offs

- Authentication is intentionally simple because OAuth/SSO is out of scope. Users authenticate with email, tenant, and password. Tokens are signed JWTs. User membership is loaded from Postgres and cached briefly; role/delete mutations invalidate the local cache, while multi-instance deployments would need shared cache invalidation.
- Asset documents are flexible, but ownership and identity fields are immutable from API input.
- Reports are eventually consistent with respect to cache TTL. Asset writes invalidate the current tenant's report cache.
- The seed script is intentionally destructive and refuses to run in production.
