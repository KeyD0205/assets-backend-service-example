import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { pgPool } from '../../db/postgres.js';
import { badRequest, conflict, notFound } from '../../shared/errors.js';
import { hashPassword } from '../../shared/passwords.js';
import type { Role } from '../../shared/roles.js';
import { mapUser } from '../tenants/tenant.repository.js';
import type { User } from './user.types.js';

type PgError = { code?: string; constraint?: string };
export type AuthUser = User & { password_hash: string };

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as PgError).code === '23505';
}

export class UserRepository {
  async findByIdInTenant(tenantId: string, userId: string): Promise<User | null> {
    const result = await pgPool.query(
      `SELECT id, tenant_id, name, email, role, created_at
       FROM users
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, userId]
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapUser(row) : null;
  }

  async findForAuth(email: string, tenantSlug?: string, tenantId?: string): Promise<AuthUser[]> {
    const params: unknown[] = [email.toLowerCase()];
    let tenantClause = '';
    if (tenantSlug) {
      params.push(tenantSlug);
      tenantClause = `AND t.slug = $${params.length}`;
    }
    if (tenantId) {
      params.push(tenantId);
      tenantClause += ` AND t.id = $${params.length}`;
    }

    const result = await pgPool.query(
      `SELECT u.id, u.tenant_id, u.name, u.email, u.role, u.created_at, u.password_hash
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1 ${tenantClause}
       ORDER BY u.created_at ASC`,
      params
    );
    return result.rows.map(row => ({
      ...mapUser(row),
      password_hash: String((row as Record<string, unknown>).password_hash)
    }));
  }

  async listByTenant(tenantId: string, input: { limit: number; cursor?: { created_at: string; id: string } }): Promise<User[]> {
    const params: unknown[] = [tenantId];
    let cursorClause = '';
    if (input.cursor) {
      params.push(input.cursor.created_at, input.cursor.id);
      cursorClause = `AND (created_at < $2::timestamptz OR (created_at = $2::timestamptz AND id > $3::uuid))`;
    }
    params.push(input.limit);
    const limitParam = params.length;

    const result = await pgPool.query(
      `SELECT id, tenant_id, name, email, role, created_at
       FROM users
       WHERE tenant_id = $1 ${cursorClause}
       ORDER BY created_at DESC, id ASC
       LIMIT $${limitParam}`,
      params
    );
    return result.rows.map(row => mapUser(row));
  }

  async createInTenant(tenantId: string, input: { name: string; email: string; password: string; role: Role }): Promise<User> {
    try {
      const passwordHash = await hashPassword(input.password);
      const result = await pgPool.query(
        `INSERT INTO users (id, tenant_id, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, tenant_id, name, email, role, created_at`,
        [randomUUID(), tenantId, input.name, input.email.toLowerCase(), passwordHash, input.role]
      );
      return mapUser(result.rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('A user with this email already exists in this tenant');
      throw err;
    }
  }

  async updateInTenant(
    tenantId: string,
    userId: string,
    patch: Partial<{ name: string; email: string; password: string; role: Role }>
  ): Promise<User> {
    if (Object.keys(patch).length === 0) throw badRequest('At least one field must be provided');

    const client = await pgPool.connect();
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      params.push(patch.name);
      sets.push(`name = $${params.length}`);
    }
    if (patch.email !== undefined) {
      params.push(patch.email.toLowerCase());
      sets.push(`email = $${params.length}`);
    }
    if (patch.password !== undefined) {
      params.push(await hashPassword(patch.password));
      sets.push(`password_hash = $${params.length}`);
    }
    if (patch.role !== undefined) {
      params.push(patch.role);
      sets.push(`role = $${params.length}`);
    }
    params.push(tenantId, userId);
    const tenantParam = params.length - 1;
    const userParam = params.length;

    try {
      await client.query('BEGIN');
      const lockedAdminCount = patch.role !== undefined && patch.role !== 'admin'
        ? await this.lockTenantAdmins(client, tenantId)
        : undefined;
      const existingResult = await client.query(
        `SELECT id, role
         FROM users
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [tenantId, userId]
      );
      const existing = existingResult.rows[0] as { role: Role } | undefined;
      if (!existing) throw notFound('User');

      if (existing.role === 'admin' && lockedAdminCount !== undefined && lockedAdminCount <= 1) {
        throw badRequest('Cannot remove the last admin in a tenant');
      }

      const result = await client.query(
        `UPDATE users
         SET ${sets.join(', ')}
         WHERE tenant_id = $${tenantParam} AND id = $${userParam}
         RETURNING id, tenant_id, name, email, role, created_at`,
        params
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (!row) throw notFound('User');
      await client.query('COMMIT');
      return mapUser(row);
    } catch (err) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(err)) throw conflict('A user with this email already exists in this tenant');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteInTenant(tenantId: string, userId: string): Promise<void> {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const lockedAdminCount = await this.lockTenantAdmins(client, tenantId);
      const existingResult = await client.query(
        `SELECT id, role
         FROM users
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [tenantId, userId]
      );
      const existing = existingResult.rows[0] as { role: Role } | undefined;
      if (!existing) throw notFound('User');

      if (existing.role === 'admin' && lockedAdminCount <= 1) {
        throw badRequest('Cannot remove the last admin in a tenant');
      }

      const result = await client.query('DELETE FROM users WHERE tenant_id = $1 AND id = $2', [tenantId, userId]);
      if (result.rowCount === 0) throw notFound('User');
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async lockTenantAdmins(client: pg.PoolClient, tenantId: string): Promise<number> {
    const result = await client.query(
      `SELECT id
       FROM users
       WHERE tenant_id = $1 AND role = 'admin'
       ORDER BY id
       FOR UPDATE`,
      [tenantId]
    );
    return result.rowCount ?? 0;
  }
}
