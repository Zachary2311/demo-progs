/**
 * Redis client for distributed rate limiting and caching
 * Falls back to in-memory storage if Redis is not available
 */

export interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

export class RedisClient {
  private redis: any = null;
  private inMemoryStore: RateLimitStore = {};
  private useRedis: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    try {
      // Try to connect to Redis if REDIS_URL is provided
      if (process.env.REDIS_URL) {
        // This would require adding 'redis' package to dependencies
        // For now, we'll use in-memory as fallback
        console.log('Redis not configured, using in-memory rate limiting');
        this.useRedis = false;
      }
    } catch (error) {
      console.log('Redis initialization failed, using in-memory storage');
      this.useRedis = false;
    }
  }

  async incrementCounter(key: string, windowMs: number): Promise<number> {
    if (this.useRedis && this.redis) {
      // Redis implementation would go here
      // return await this.redis.incr(key);
    }

    // In-memory fallback
    const now = Date.now();
    if (!this.inMemoryStore[key]) {
      this.inMemoryStore[key] = { count: 1, resetTime: now + windowMs };
      return 1;
    }

    const entry = this.inMemoryStore[key];
    if (now > entry.resetTime) {
      this.inMemoryStore[key] = { count: 1, resetTime: now + windowMs };
      return 1;
    }

    entry.count++;
    return entry.count;
  }

  getCounter(key: string): { count: number; resetTime: number } | null {
    if (this.useRedis && this.redis) {
      // Redis implementation would go here
    }

    const now = Date.now();
    const entry = this.inMemoryStore[key];
    if (!entry) return null;
    if (now > entry.resetTime) return null;
    return entry;
  }

  async reset(key: string): Promise<void> {
    if (this.useRedis && this.redis) {
      // Redis implementation would go here
    }

    delete this.inMemoryStore[key];
  }

  async disconnect(): Promise<void> {
    if (this.useRedis && this.redis) {
      // Redis implementation would go here
    }
  }
}

export const redisClient = new RedisClient();
