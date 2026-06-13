import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1 } as const;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS) as Buffer;
  return `scrypt:v1:${salt}:${derivedKey.toString('base64url')}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [algorithm, version, salt, encodedKey] = passwordHash.split(':');
  if (algorithm !== 'scrypt' || version !== 'v1' || !salt || !encodedKey) return false;

  const expectedKey = Buffer.from(encodedKey, 'base64url');
  const actualKey = await scrypt(password, salt, expectedKey.length, SCRYPT_OPTIONS) as Buffer;

  return expectedKey.length === actualKey.length && timingSafeEqual(expectedKey, actualKey);
}
