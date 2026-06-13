-- Seed data for the multi-tenant asset service.
--
-- This file provisions a minimal tenants/users schema and inserts three
-- tenants with a small set of users each. Feel free to modify the schema
-- if your design needs different shapes; what matters is that the same
-- three tenants and their users end up in your relational store.
--
-- Generated deterministically. Re-running this generator produces the same
-- output byte-for-byte.

BEGIN;

CREATE TABLE IF NOT EXISTS tenants (
    id          UUID PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_created_id ON users(tenant_id, created_at DESC, id ASC);

-- Tenants
INSERT INTO tenants (id, name, slug, created_at) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Northwind Utilities', 'northwind-utilities', '2024-01-15T10:00:00Z'),
  ('22222222-2222-4222-8222-222222222222', 'Beacon Sensors', 'beacon-sensors', '2024-03-22T09:30:00Z'),
  ('33333333-3333-4333-8333-333333333333', 'Civic Works', 'civic-works', '2024-06-10T14:15:00Z');

-- Users
INSERT INTO users (id, tenant_id, name, email, password_hash, role, created_at) VALUES
  ('bdd640fb-0667-4ad1-9c80-317fa3b1799d', '11111111-1111-4111-8111-111111111111', 'Amelia Chen', 'amelia@northwind.test', 'scrypt:v1:bdd640fb06674ad19c80317fa3b1799d:dZHmDovd66FGctWWv8uu04n5vX0YuPfMPxcsvtruJnW78hOmrn5A7Dht8yc3PxLb2Lj-vj_VM2s8U8D-3tnG9g', 'admin', '2024-01-15T10:00:00Z'),
  ('23b8c1e9-3924-46de-beb1-3b9046685257', '11111111-1111-4111-8111-111111111111', 'Sam Patel', 'sam@northwind.test', 'scrypt:v1:23b8c1e9392446debeb13b9046685257:kFSDROsJcaxgEaMtRuu8lqHGMRvoumX8We13SCBJCe3oKkT9EgElVlCCyRZKuSHm1zuw2Yf-pG9p0oVQVq3Zng', 'editor', '2024-01-15T10:00:00Z'),
  ('bd9c66b3-ad3c-4d6d-9a3d-1fa7bc8960a9', '11111111-1111-4111-8111-111111111111', 'Priya Iyer', 'priya@northwind.test', 'scrypt:v1:bd9c66b3ad3c4d6d9a3d1fa7bc8960a9:eBli7ZNPJVJI0WgmkOeiwxHivBK4QbMk-a_ewlGencznuTkrmNk6HfN6s2kshoHpJtZiKYgXy8Y_-POgc0ycHQ', 'editor', '2024-01-15T10:00:00Z'),
  ('972a8469-1641-4f82-8b9d-2434e465e150', '11111111-1111-4111-8111-111111111111', 'Declan Murphy', 'declan@northwind.test', 'scrypt:v1:972a846916414f828b9d2434e465e150:vHrBYC2wygeDZoVmWJga5g7LIxjeIwW426XeEqERPJhQu1Uqo0CkiDOFIlRRVQKwrNYWEP0idYnDgvm8kV6aZg', 'viewer', '2024-01-15T10:00:00Z'),
  ('17fc695a-07a0-4a6e-8822-e8f36c031199', '22222222-2222-4222-8222-222222222222', 'Cora Reyes', 'cora@beacon.test', 'scrypt:v1:17fc695a07a04a6e8822e8f36c031199:AUPV1OQSn3Dd6nTOfNxazlgnnvKI_bcbVrIJphsvMDcfXJkDa5pirQFNw-8rXjfBpLylca5MRIjYL2onG0fogQ', 'admin', '2024-03-22T09:30:00Z'),
  ('9a1de644-815e-46d1-bb8f-aa1837f8a88b', '22222222-2222-4222-8222-222222222222', 'Felix Tanaka', 'felix@beacon.test', 'scrypt:v1:9a1de644815e46d1bb8faa1837f8a88b:rUto9mpx71uPMYO_EjsEhNSeQD18CR2EeZNoTyg26TjRfAin0npkiaIcw5Lsk0XXVHoVUMwAYwcsFHxwzOLx8A', 'editor', '2024-03-22T09:30:00Z'),
  ('b74d0fb1-32e7-4629-8fad-c1a606cb0fb3', '22222222-2222-4222-8222-222222222222', 'Ines Costa', 'ines@beacon.test', 'scrypt:v1:b74d0fb132e746298fadc1a606cb0fb3:2M0lP6EkycTtdES01dNRMypDuk8fLir-md2Ca0jNxvp3UVqL1vjGctb6YCmD_6RIC-yMAza8ux20EnU2s7WY4Q', 'viewer', '2024-03-22T09:30:00Z'),
  ('6b65a6a4-8b81-48f6-b38a-088ca65ed389', '33333333-3333-4333-8333-333333333333', 'Eli Brown', 'eli@civicworks.test', 'scrypt:v1:6b65a6a48b8148f6b38a088ca65ed389:ztyytWOh86b19lMKRD0cIp4jg37H9XvW0njpYomk5R25wOKTX93Fv2h7Y2uI4_SwipkGXI3acsNZyAUCmuxkcA', 'admin', '2024-06-10T14:15:00Z'),
  ('47378190-96da-4dac-b2ff-5d2a386ecbe0', '33333333-3333-4333-8333-333333333333', 'Rosa Hidalgo', 'rosa@civicworks.test', 'scrypt:v1:4737819096da4dacb2ff5d2a386ecbe0:U6WyFaIHAEJXcvpbhF4m2lpFIP2Fc3YGGbeKEoOX4dWznP1ZR_ALCfeAU_iBa13EMvlKIyHie4YF1QHclGsslg', 'editor', '2024-06-10T14:15:00Z'),
  ('c241330b-01a9-471f-9e8a-774bcf36d58b', '33333333-3333-4333-8333-333333333333', 'Kalani Wong', 'kalani@civicworks.test', 'scrypt:v1:c241330b01a9471f9e8a774bcf36d58b:SeUXRcZSFZNYulwNtdylQzrTWtq7aj7Bo_Ri-_FaSkxGjanj8ciUSRNpyQ7plN5jVeRAYSeRuHf7Pkr0ZnTTSw', 'editor', '2024-06-10T14:15:00Z'),
  ('6c307511-b2b9-437a-a8df-6ec4ce4a2bbd', '33333333-3333-4333-8333-333333333333', 'Vance Okafor', 'vance@civicworks.test', 'scrypt:v1:6c307511b2b9437aa8df6ec4ce4a2bbd:XC6eCQAE27917kKRB2wzXaxuQn_PKji4u8ypq0k_qvKzAXJtyUqHOayG8BQ1SUBfAcx6i6QM4Q1FuFe2LuTGWg', 'viewer', '2024-06-10T14:15:00Z');

COMMIT;
