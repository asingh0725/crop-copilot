import { getRedis } from "@/lib/redis";

/**
 * Redis cache utility with TTL support
 */
export class RedisCache {
  private prefix: string;
  private defaultTTL: number;

  constructor(prefix: string = "agronomist", defaultTTL: number = 3600) {
    this.prefix = prefix;
    this.defaultTTL = defaultTTL;
  }

  private getKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  /**
   * Get cached value
   * Silently returns null on error (graceful degradation)
   */
  async get<T>(key: string): Promise<T | null> {
    const redis = getRedis();
    if (!redis) return null;

    try {
      const data = await redis.get(this.getKey(key));
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch {
      // Silently fail - database fallback will handle it
      return null;
    }
  }

  /**
   * Set cached value with optional TTL
   * Silently returns false on error (graceful degradation)
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
      const serialized = JSON.stringify(value);
      const ttl = ttlSeconds ?? this.defaultTTL;

      if (ttl > 0) {
        await redis.setex(this.getKey(key), ttl, serialized);
      } else {
        await redis.set(this.getKey(key), serialized);
      }
      return true;
    } catch {
      // Silently fail - data will be fetched fresh next time
      return false;
    }
  }

  /**
   * Delete cached value
   * Silently returns false on error (graceful degradation)
   */
  async delete(key: string): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
      await redis.del(this.getKey(key));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete all keys matching a pattern
   * Silently returns 0 on error (graceful degradation)
   */
  async deletePattern(pattern: string): Promise<number> {
    const redis = getRedis();
    if (!redis) return 0;

    try {
      const keys = await redis.keys(this.getKey(pattern));
      if (keys.length === 0) return 0;
      return await redis.del(...keys);
    } catch {
      return 0;
    }
  }

  /**
   * Check if key exists
   * Silently returns false on error (graceful degradation)
   */
  async exists(key: string): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
      return (await redis.exists(this.getKey(key))) === 1;
    } catch {
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   * Silently returns -1 on error (graceful degradation)
   */
  async ttl(key: string): Promise<number> {
    const redis = getRedis();
    if (!redis) return -1;

    try {
      return await redis.ttl(this.getKey(key));
    } catch {
      return -1;
    }
  }
}

// Pre-configured cache instances
export const productCache = new RedisCache("products", 1800); // 30 minutes
export const pricingCache = new RedisCache("pricing", 3600); // 1 hour
export const searchCache = new RedisCache("search", 7200); // 2 hours
