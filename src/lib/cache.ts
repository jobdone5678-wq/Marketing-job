/**
 * NextKinHR Multi-Tier In-Memory Cache (System Design Optimization)
 *
 * Implements:
 * 1. O(1) in-memory key-value storage with TTL expiration
 * 2. Stale-While-Revalidate (SWR) asynchronous cache revalidation
 * 3. Soft max-capacity eviction (LRU-inspired) to prevent unbounded memory growth
 * 4. Cache stampede / thundering herd mitigation via promise-deduplication
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  staleAt: number;
}

export class MemoryCache<T = any> {
  private store = new Map<string, CacheEntry<T>>();
  private inFlight = new Map<string, Promise<T>>();
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T, ttlMs: number, staleTtlMs = ttlMs * 2): void {
    // Evict oldest entry if at capacity
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }

    const now = Date.now();
    this.store.set(key, {
      value,
      expiresAt: now + staleTtlMs, // Retain until staleTtl for SWR
      staleAt: now + ttlMs,
    });
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
    this.inFlight.clear();
  }

  /**
   * Fetch with Stale-While-Revalidate and Thundering Herd mitigation
   */
  async fetchWithSWR(
    key: string,
    fetcher: () => Promise<T>,
    options: { ttlMs: number; staleTtlMs?: number }
  ): Promise<T> {
    const entry = this.store.get(key);
    const now = Date.now();

    // 1. Fresh cache hit: Return immediately (< 1ms)
    if (entry && now < entry.staleAt) {
      return entry.value;
    }

    // 2. Stale cache hit: Return immediately, revalidate in background
    if (entry && now < entry.expiresAt) {
      // Trigger background refresh without blocking current request
      if (!this.inFlight.has(key)) {
        const bgPromise = fetcher()
          .then((fresh) => {
            this.set(key, fresh, options.ttlMs, options.staleTtlMs);
            return fresh;
          })
          .catch((err) => {
            console.error(`[Cache SWR Revalidate Error] key=${key}`, err);
            return entry.value;
          })
          .finally(() => {
            this.inFlight.delete(key);
          });
        this.inFlight.set(key, bgPromise);
      }
      return entry.value;
    }

    // 3. Cache miss: Deduplicate concurrent in-flight requests (thundering herd protection)
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const promise = fetcher()
      .then((data) => {
        this.set(key, data, options.ttlMs, options.staleTtlMs);
        return data;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }
}

// Global shared caches for high-traffic entities
export const candidateProfileCache = new MemoryCache<{ id: string; user_id: string }>(500);
export const outsideJobsCache = new MemoryCache<any[]>(200);
