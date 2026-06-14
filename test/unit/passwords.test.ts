import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/shared/passwords.js';

describe('hashPassword / verifyPassword', () => {
  it('produces a scrypt:v1 formatted hash', async () => {
    const hash = await hashPassword('test-password-123');
    expect(hash).toMatch(/^scrypt:v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
  });

  it('uses a random salt so two hashes of the same password differ', async () => {
    const h1 = await hashPassword('same-password');
    const h2 = await hashPassword('same-password');
    expect(h1).not.toBe(h2);
  });

  it('verifies the correct password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('rejects a completely malformed hash string', async () => {
    expect(await verifyPassword('password', 'not-a-hash')).toBe(false);
  });

  it('rejects a hash with an unknown algorithm prefix', async () => {
    expect(await verifyPassword('password', 'bcrypt:v1:salt:key')).toBe(false);
  });

  it('rejects a hash with a missing key segment', async () => {
    expect(await verifyPassword('password', 'scrypt:v1:onlysalt')).toBe(false);
  });

  it('rejects an empty string as hash', async () => {
    expect(await verifyPassword('password', '')).toBe(false);
  });
});
