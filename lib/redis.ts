import Redis from "ioredis";

// Redis connection singleton
let redisInstance: Redis | null = null;
let redisUnavailable = false;
let warningLogged = false;

/**
 * Get Redis connection instance
 * Returns null if Redis URL is not configured or Redis is unavailable
 * (allows graceful degradation to database-only caching)
 */
export function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) {
    if (!warningLogged) {
      console.log(
        "[Redis] REDIS_URL not configured - using database-only caching"
      );
      warningLogged = true;
    }
    return null;
  }

  // If Redis has been marked unavailable, don't try to reconnect
  if (redisUnavailable) {
    return null;
  }

  if (!redisInstance) {
    redisInstance = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 2) {
          // Mark Redis as unavailable after failed retries
          redisUnavailable = true;
          console.log(
            "[Redis] Connection failed after retries - falling back to database-only caching"
          );
          return null; // Stop retrying
        }
        return Math.min(times * 500, 2000); // Exponential backoff
      },
      lazyConnect: true,
      enableOfflineQueue: false, // Don't queue commands when disconnected
      connectTimeout: 5000, // 5 second connection timeout
    });

    redisInstance.on("error", (err) => {
      // Only log the first error to avoid spam
      if (!redisUnavailable) {
        console.log(`[Redis] Connection error - falling back to database caching`);
        redisUnavailable = true;
      }
    });

    redisInstance.on("connect", () => {
      console.log("[Redis] Connected successfully");
      redisUnavailable = false;
    });

    redisInstance.on("close", () => {
      // Silent close - connection closed
    });
  }

  return redisInstance;
}

/**
 * Gracefully close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
}

/**
 * Check if Redis is available and connected
 */
export async function isRedisAvailable(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
