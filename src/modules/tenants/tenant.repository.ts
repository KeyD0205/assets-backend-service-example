import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { pgPool } from '../../db/postgres.js';
import { conflict, notFound } from '../../shared/errors.js';
import { hashPassword } from '../../shared/passwords.js';
import type { Tenant } from './tenant.types.js';
import type { User } from '../users/user.types.js';
import { mapUser } from '../users/user.repository.js';

function mapTenant(row: Record<string, unknown>): Tenant {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    created_at: new Date(String(row.created_at)).toISOString()
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505';
}

export class TenantRepository {
  async findById(tenantId: string): Promise<Tenant | null> {
    const result = await pgPool.query('SELECT id, name, slug, created_at FROM tenants WHERE id = $1', [tenantId]);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapTenant(row) : null;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const result = await pgPool.query('SELECT id, name, slug, created_at FROM tenants WHERE slug = $1', [slug]);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapTenant(row) : null;
  }

  async createWithAdmin(input: {
    name: string;
    slug: string;
    admin: { name: string; email: string; password: string };
  }): Promise<{ tenant: Tenant; admin: User }> {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const tenantId = randomUUID();
      const adminId = randomUUID();
      const passwordHash = await hashPassword(input.admin.password);

      const tenantResult = await client.query(
        `INSERT INTO tenants (id, name, slug)
         VALUES ($1, $2, $3)
         RETURNING id, name, slug, created_at`,
        [tenantId, input.name, input.slug]
      );

      const adminResult = await client.query(
        `INSERT INTO users (id, tenant_id, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, 'admin')
         RETURNING id, tenant_id, name, email, role, created_at`,
        [adminId, tenantId, input.admin.name, input.admin.email.toLowerCase(), passwordHash]
      );

      await client.query('COMMIT');
      return {
        tenant: mapTenant(tenantResult.rows[0]),
        admin: mapUser(adminResult.rows[0])
      };
    } catch (err) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(err)) throw conflict('Tenant slug or admin email already exists');
      throw err;
    } finally {
      client.release();
    }
  }
}

export async function ensureTenantExists(tenantId: string, client?: pg.PoolClient): Promise<Tenant> {
  const executor = client ?? pgPool;
  const result = await executor.query('SELECT id, name, slug, created_at FROM tenants WHERE id = $1', [tenantId]);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw notFound('Tenant');
  return mapTenant(row);
}
