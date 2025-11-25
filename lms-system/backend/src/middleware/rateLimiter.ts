import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

const store: RateLimitStore = {};
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000');
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100');

export const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  if (!store[ip]) {
    store[ip] = { count: 1, resetTime: now + WINDOW_MS };
    return next();
  }

  const { count, resetTime } = store[ip];

  if (now > resetTime) {
    store[ip] = { count: 1, resetTime: now + WINDOW_MS };
    return next();
  }

  if (count >= MAX_REQUESTS) {
    logger.warn(`Rate limit exceeded for IP: ${ip}`);
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil((resetTime - now) / 1000)
    });
  }

  store[ip].count++;
  next();
};
