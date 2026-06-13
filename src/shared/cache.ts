type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export class TtlCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  deletePrefix(prefix: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

export const cache = new TtlCache();
