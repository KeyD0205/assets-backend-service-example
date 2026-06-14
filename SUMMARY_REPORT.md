# Summary Report

## Approach

I implemented the solution as a small multi-tenant backend service with a clear storage boundary between relational identity data and flexible asset documents. The core design choice is that tenant identity, users, credentials, and roles live in PostgreSQL, while tenant-owned assets live in MongoDB.

That split matches the assignment's main design question:

```text
authenticated request
  -> bearer token validation
  -> server-side tenant context
  -> tenant-scoped Postgres access for tenants and users
  -> tenant-scoped Mongo access for asset documents
  -> cross-store report combining both stores
```

Tenant isolation is treated as the primary correctness concern. Every authenticated route resolves a server-side request context with `tenantId`, `userId`, and `role`, then repositories require that tenant id explicitly for all scoped reads and writes. The API never trusts caller-supplied ownership fields for assets.

## What was built

### Universal section

- Node.js, Express, and TypeScript backend.
- PostgreSQL schema and seed data for tenants, users, roles, credential hashes, and relational constraints.
- MongoDB asset collection for flexible per-tenant asset documents.
- Simple bearer-token authentication using signed JWTs.
- Server-side tenant context loaded from PostgreSQL on every authenticated request.
- Tenant onboarding with initial admin creation.
- Tenant-scoped user management with role-based write permissions.
- Tenant-scoped asset CRUD.
- Asset filtering by `type` and `status`.
- Cursor pagination for asset and user list endpoints.
- Cross-store asset summary report that combines tenant metadata from PostgreSQL with MongoDB asset aggregates.
- In-process TTL cache for the report endpoint, scoped by tenant and invalidated on asset writes.
- Central error contract with request ids.
- Security middleware for request ids, Helmet, CORS, HTTPS enforcement in production, rate limiting, input sanitization, and body-size limits.
- Seed script for both stores.
- GitHub Actions CI that runs install, seed, TypeScript build, unit/integration tests, and `npm audit`.

### Backend section

- Application entrypoint under `src/server.ts` and Express app construction under `src/app.ts`.
- Auth routes under `src/modules/auth`.
- Tenant routes under `src/modules/tenants`.
- User routes under `src/modules/users`.
- Asset routes under `src/modules/assets`.
- Report route under `src/modules/reports`.
- Shared middleware and infrastructure under `src/middleware`, `src/db`, `src/config`, and `src/shared`.
- Unit and integration tests under `test`.

### API section

- `GET /health`
- `POST /v1/auth/tokens`
- `POST /v1/tenants`
- `GET /v1/tenants/me`
- `GET /v1/users`
- `POST /v1/users`
- `GET /v1/users/:userId`
- `PATCH /v1/users/:userId`
- `DELETE /v1/users/:userId`
- `GET /v1/assets`
- `POST /v1/assets`
- `GET /v1/assets/:assetId`
- `PATCH /v1/assets/:assetId`
- `DELETE /v1/assets/:assetId`
- `GET /v1/reports/assets/summary`

## Key results from the seed data

| Result | Value |
| --- | ---: |
| Seeded tenants | 3 |
| Seeded assets per tenant | 100 |
| Total seeded assets | 300 |
| Asset stores used | PostgreSQL metadata + MongoDB documents |
| Test files | 7 |
| Tests | 79 |
| CI verification steps | install, seed, build, test, audit |

## Store boundary and rationale

### PostgreSQL

PostgreSQL stores the data that benefits from strict relationships, uniqueness, and transactional constraints:

- Tenants.
- Users.
- Password hashes.
- User roles.
- Tenant-scoped email uniqueness.
- Tenant and user lookup indexes.

This is the right fit because tenant identity and membership are highly structured. A user belongs to a tenant, a role must be valid, emails should be unique inside a tenant, and admin safety rules should be handled transactionally.

### MongoDB

MongoDB stores assets because each tenant shares the same required core asset shape but may add different tenant-specific fields:

- `id`
- `tenant_id`
- `name`
- `type`
- `status`
- `lat`
- `lng`
- `installed_at`
- tenant-specific extension fields

The API validates the common core shape and permits additional document fields. It rejects protected ownership and identity fields, including nested Mongo operator keys such as `$set` and dotted keys, so flexible documents do not become an injection path.

## Tenant isolation

Tenant isolation is enforced at the request-context and repository boundaries:

- Authenticated routes require a bearer token.
- Token payloads are verified with issuer, audience, and algorithm constraints.
- The user is loaded from PostgreSQL by `tenant_id` and `user_id`, with a short in-process auth cache for repeat requests.
- `req.ctx` is populated only after the tenant membership check succeeds.
- User repository methods scope reads and writes by tenant.
- Asset repository methods scope reads and writes by tenant.
- Asset list, detail, update, delete, and report queries all include `tenant_id`.
- Cross-tenant asset ids return `404` rather than leaking existence with `403`.
- The report cache key includes the tenant id.

This gives the code an unambiguous enforcement point: routes authenticate once, then downstream operations consume the server-created tenant context instead of client-provided tenant identifiers.

## Validation and security handling

### Asset validation

Assets are validated with a strict core schema:

- `name` is required and bounded.
- `type` is required and bounded.
- `status` must be one of `ok`, `warning`, or `critical`.
- `lat` and `lng` must be valid coordinate ranges.
- `installed_at` must use `YYYY-MM-DD`.

Tenant-specific extension fields are allowed, but unsafe keys are blocked:

- top-level `id`
- top-level `_id`
- top-level `tenant_id`
- top-level `created_at`
- top-level `updated_at`
- top-level `deleted_at`
- any key beginning with `$`
- any key containing `.`

### User-management safety

Admin-only user mutations are protected with role middleware. The service also blocks unsafe tenant administration operations:

- Non-admins cannot create, update, or delete users.
- Users cannot delete themselves.
- The last tenant admin cannot be deleted.
- The last tenant admin cannot be demoted.

### Runtime hardening

The app disables `x-powered-by`, applies request logging, Helmet, configurable CORS, HTTPS enforcement in production, rate limiting, request ids, input sanitization, request body limits, and dependency-aware health checks. Non-development startup rejects placeholder JWT secrets, and production rejects wildcard CORS.

## Cross-store report

The report endpoint `GET /v1/reports/assets/summary` joins data across both stores:

```text
PostgreSQL
  -> tenant id, tenant name, tenant slug

MongoDB
  -> total asset count
  -> assets grouped by status
  -> assets grouped by type
  -> newest installed_at
  -> oldest installed_at
```

The report is useful because it demonstrates the intended division of responsibility: PostgreSQL remains the source of truth for tenant metadata, and MongoDB remains the source of truth for flexible asset data. The response is cached per tenant for a short TTL and invalidated when assets are created, updated, or deleted.

## Indexing strategy

### PostgreSQL

The SQL seed defines relational constraints and tenant-friendly indexes, including:

- tenant primary key.
- tenant slug uniqueness.
- user primary key.
- user-to-tenant foreign key.
- role check constraint.
- tenant-scoped unique user email.
- `idx_users_tenant_id`.
- `idx_users_tenant_created_id`.

### MongoDB

MongoDB indexes are aligned with the exposed API access patterns:

- unique asset identity per tenant: `{ tenant_id: 1, id: 1 }`.
- tenant asset listing sorted by install date.
- tenant + type filtering.
- tenant + status filtering.
- tenant + type + status filtering.

All Mongo access patterns begin with `tenant_id`, which supports both performance and isolation.

## Testing and CI

The tests focus on the highest-risk assignment requirements:

- tenant-scoped asset listing.
- cross-tenant asset lookup behavior.
- rejection of client-supplied `tenant_id`.
- viewer authorization boundaries.
- asset CRUD.
- type and status filters.
- report cache invalidation after asset writes.
- tenant onboarding.
- user management by admins.
- non-admin user-management rejection.
- self-delete protection.
- last-admin protection.
- missing and malformed token handling.
- asset core field validation.
- nested Mongo operator and dotted-key rejection.

GitHub Actions runs the project against real PostgreSQL and MongoDB services:

```text
npm ci
npm run seed
npm run build
npm test
npm audit
```

Locally, the post-install verification sequence is available as:

```text
npm run verify
```

This gives reviewers a quick confidence path: the app is not only typechecked, it is seeded and tested against the same database types used by the service.

## Reviewer quick path

The fastest local review path is:

```bash
cp .env.example .env
npm ci
npm run db:up
npm run verify
npm run dev
```

Then check:

```bash
curl http://localhost:3000/health
```

Get a token:

```bash
curl -s -X POST http://localhost:3000/v1/auth/tokens \
  -H 'content-type: application/json' \
  -d '{"email":"amelia@northwind.test","password":"password123","tenant_slug":"northwind-utilities"}'
```

Use the token against assets and reports:

```bash
curl http://localhost:3000/v1/assets?status=warning \
  -H "authorization: Bearer $TOKEN"

curl http://localhost:3000/v1/reports/assets/summary \
  -H "authorization: Bearer $TOKEN"
```

## System design perspective

This implementation is intentionally small, but it keeps the boundaries I would want in a production multi-tenant system:

- Keep tenant membership and authorization facts in a relational store.
- Keep flexible asset payloads in a document store.
- Never trust tenant ids from request bodies or query parameters for ownership.
- Make tenant context server-derived and explicit in repository contracts.
- Keep document flexibility behind core validation and protected-field checks.
- Use indexes that mirror API access patterns.
- Cache only tenant-scoped read models, and invalidate them on tenant-scoped writes.
- Prefer a small number of meaningful tenant-isolation tests over broad but shallow coverage.

## Production evolution

The next production steps would be:

- Add refresh tokens or rotating token sessions if longer-lived authentication is needed.
- Add structured audit logging for user and asset mutations.
- Add database migrations instead of relying on seed SQL as the schema source.
- Add request-level authorization tests for every route.
- Add OpenAPI documentation for reviewer and client ergonomics.
- Add external cache support if report traffic grows beyond one Node process.
- Add explicit optimistic concurrency controls for high-write asset workflows.
- Add deployment-specific secret management.
- Add monitoring for auth failures, tenant-scoped query latency, cache hit rate, and database connection pool pressure.

## Tradeoffs

- Authentication is intentionally simple because OAuth, SSO, and external identity providers are out of scope.
- JWTs carry tenant and user ids. User membership is loaded from PostgreSQL and cached briefly; local role/delete mutations invalidate the cache in-process, while multi-instance deployments would need shared cache invalidation.
- MongoDB allows tenant-specific asset fields, but the API still validates the common core shape and blocks ownership fields.
- The report cache is in-process. It is sufficient for a local assignment service, but a multi-instance deployment would need shared cache invalidation.
- The seed script is intentionally destructive and refuses to run in production, which is useful for local review but should become migrations plus non-destructive seed fixtures in a larger system.
- Integration coverage prioritizes tenant isolation, authorization, validation, and report cache behavior rather than exhaustive route permutations.
