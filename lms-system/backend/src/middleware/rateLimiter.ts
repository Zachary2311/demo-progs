import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { redisClient } from '../utils/redis';

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000');
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100');

/**
 * Rate limiting middleware that respects X-Forwarded-For headers
 * Works behind NGINX/reverse proxies with app.set('trust proxy', 1) configured
 */
export const rateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get client IP - respects X-Forwarded-For if trust proxy is enabled
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `rate-limit:${clientIp}`;
    const now = Date.now();

    // Increment counter using Redis or in-memory store
    const entry = redisClient.getCounter(key);

    if (!entry) {
      // First request or window expired
      await redisClient.incrementCounter(key, WINDOW_MS);
      return next();
    }

    const { count, resetTime } = entry;

    if (count >= MAX_REQUESTS) {
      logger.warn(`Rate limit exceeded for IP: ${clientIp} (${count} requests in window)`);
      res.set('Retry-After', Math.ceil((resetTime - now) / 1000).toString());
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((resetTime - now) / 1000)
      });
    }

    await redisClient.incrementCounter(key, WINDOW_MS);
    next();
  } catch (error) {
    logger.error('Rate limiting error:', error);
    // On error, allow request to proceed but log it
    next();
  }
};
