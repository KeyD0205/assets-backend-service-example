import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { decodeCursor, encodeCursor } from '../../src/shared/pagination.js';

const cursorSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string()
});

describe('encodeCursor / decodeCursor', () => {
  it('round-trips a valid cursor', () => {
    const value = {
      id: '00000000-0000-4000-8000-000000000001',
      created_at: '2024-01-01T00:00:00.000Z'
    };
    expect(decodeCursor(encodeCursor(value), cursorSchema)).toEqual(value);
  });

  it('encodes to URL-safe characters only (no +, /, =)', () => {
    const encoded = encodeCursor({ id: 'abc', created_at: '2024' });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('throws bad_request on non-base64url input', () => {
    expect(() => decodeCursor('not valid!!!', cursorSchema)).toThrow('Invalid pagination cursor');
  });

  it('throws bad_request on base64url that is not JSON', () => {
    const garbage = Buffer.from('not-json', 'utf8').toString('base64url');
    expect(() => decodeCursor(garbage, cursorSchema)).toThrow('Invalid pagination cursor');
  });

  it('throws bad_request on JSON that fails schema validation', () => {
    const missingFields = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf8').toString('base64url');
    expect(() => decodeCursor(missingFields, cursorSchema)).toThrow('Invalid pagination cursor');
  });

  it('throws bad_request on an empty string', () => {
    expect(() => decodeCursor('', cursorSchema)).toThrow('Invalid pagination cursor');
  });

  it('throws bad_request on a cursor with a valid structure but wrong field types', () => {
    const wrongTypes = Buffer.from(JSON.stringify({ id: 123, created_at: null }), 'utf8').toString('base64url');
    expect(() => decodeCursor(wrongTypes, cursorSchema)).toThrow('Invalid pagination cursor');
  });
});
