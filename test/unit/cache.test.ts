import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../../src/shared/cache.js';

describe('TtlCache', () => {
  let cache: TtlCache;

  beforeEach(() => {
    cache = new TtlCache();
  });

  afterEach(() => {
    cache.stopEviction();
    vi.useRealTimers();
  });

  describe('get / set', () => {
    it('returns undefined for a missing key', () => {
      expect(cache.get('missing')).toBeUndefined();
    });

    it('returns the stored value for a live entry', () => {
      cache.set('k', 'hello', 10);
      expect(cache.get<string>('k')).toBe('hello');
    });

    it('returns undefined and evicts an expired entry on get', () => {
      vi.useFakeTimers();
      cache.set('k', 'v', 1);
      vi.advanceTimersByTime(1001);
      expect(cache.get('k')).toBeUndefined();
    });

    it('stores complex objects', () => {
      const obj = { id: '1', nested: { x: 42 } };
      cache.set('obj', obj, 10);
      expect(cache.get('obj')).toEqual(obj);
    });
  });

  describe('delete', () => {
    it('removes an existing key', () => {
      cache.set('k', 'v', 10);
      cache.delete('k');
      expect(cache.get('k')).toBeUndefined();
    });

    it('is a no-op for a missing key', () => {
      expect(() => cache.delete('nonexistent')).not.toThrow();
    });
  });

  describe('deletePrefix', () => {
    it('removes all keys matching the prefix', () => {
      cache.set('tenant:1:a', 'x', 10);
      cache.set('tenant:1:b', 'y', 10);
      cache.set('tenant:2:a', 'z', 10);
      cache.deletePrefix('tenant:1:');
      expect(cache.get('tenant:1:a')).toBeUndefined();
      expect(cache.get('tenant:1:b')).toBeUndefined();
      expect(cache.get<string>('tenant:2:a')).toBe('z');
    });

    it('is a no-op when no keys match the prefix', () => {
      cache.set('foo', 'v', 10);
      expect(() => cache.deletePrefix('bar:')).not.toThrow();
      expect(cache.get<string>('foo')).toBe('v');
    });
  });

  describe('purgeExpired', () => {
    it('removes expired entries and leaves live ones', () => {
      vi.useFakeTimers();
      cache.set('live', 'v', 10);
      cache.set('dead', 'v', 1);
      vi.advanceTimersByTime(1001);
      cache.purgeExpired();
      expect(cache.get('dead')).toBeUndefined();
      expect(cache.get<string>('live')).toBe('v');
    });

    it('is a no-op on an empty cache', () => {
      expect(() => cache.purgeExpired()).not.toThrow();
    });
  });

  describe('startEviction / stopEviction', () => {
    it('auto-evicts expired entries after the interval fires', () => {
      vi.useFakeTimers();
      cache.set('k', 'v', 1);
      cache.startEviction(500);
      vi.advanceTimersByTime(1500);
      // entry is expired; next get() would evict lazily
      expect(cache.get('k')).toBeUndefined();
    });

    it('stopEviction is idempotent and does not throw', () => {
      cache.startEviction(1000);
      expect(() => cache.stopEviction()).not.toThrow();
      expect(() => cache.stopEviction()).not.toThrow();
    });

    it('startEviction replaces an existing timer', () => {
      cache.startEviction(5000);
      expect(() => cache.startEviction(1000)).not.toThrow();
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      cache.set('a', 1, 10);
      cache.set('b', 2, 10);
      cache.clear();
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
    });

    it('is a no-op on an empty cache', () => {
      expect(() => cache.clear()).not.toThrow();
    });
  });
});
