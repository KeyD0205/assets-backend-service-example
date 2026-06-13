import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1 } as const;

async function deriveKey(password: string, salt: string, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, SCRYPT_OPTIONS, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const derivedKey = await deriveKey(password, salt, KEY_LENGTH);
  return `scrypt:v1:${salt}:${derivedKey.toString('base64url')}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [algorithm, version, salt, encodedKey] = passwordHash.split(':');
  if (algorithm !== 'scrypt' || version !== 'v1' || !salt || !encodedKey) return false;

  const expectedKey = Buffer.from(encodedKey, 'base64url');
  const actualKey = await deriveKey(password, salt, expectedKey.length);

  return expectedKey.length === actualKey.length && timingSafeEqual(expectedKey, actualKey);
}
