import type { Env } from '../types';

const RATE_LIMIT_PREFIX = 'rate_limit:';
const WINDOW_SIZE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// Sliding window rate limiter using KV
export async function checkRateLimit(
  env: Env,
  userId: string,
  limit: number = 100
): Promise<RateLimitResult> {
  const key = `${RATE_LIMIT_PREFIX}${userId}`;
  const now = Date.now();
  const windowStart = now - WINDOW_SIZE_MS;

  // Get current state
  const stored = await env.KV.get(key, 'json') as { requests: number[] } | null;
  const requests = stored?.requests || [];

  // Filter to only requests within the window
  const validRequests = requests.filter((timestamp: number) => timestamp > windowStart);

  // Check if limit exceeded
  if (validRequests.length >= limit) {
    const oldestRequest = Math.min(...validRequests);
    const resetAt = oldestRequest + WINDOW_SIZE_MS;
    
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  // Add new request
  validRequests.push(now);

  // Store updated state with TTL
  await env.KV.put(key, JSON.stringify({ requests: validRequests }), {
    expirationTtl: 86400, // 24 hours
  });

  return {
    allowed: true,
    remaining: limit - validRequests.length,
    resetAt: now + WINDOW_SIZE_MS,
  };
}

// Get rate limit status without incrementing
export async function getRateLimitStatus(
  env: Env,
  userId: string,
  limit: number = 100
): Promise<{ used: number; remaining: number; resetAt: number }> {
  const key = `${RATE_LIMIT_PREFIX}${userId}`;
  const now = Date.now();
  const windowStart = now - WINDOW_SIZE_MS;

  const stored = await env.KV.get(key, 'json') as { requests: number[] } | null;
  const requests = stored?.requests || [];
  const validRequests = requests.filter((timestamp: number) => timestamp > windowStart);

  const resetAt = validRequests.length > 0 
    ? Math.min(...validRequests) + WINDOW_SIZE_MS 
    : now + WINDOW_SIZE_MS;

  return {
    used: validRequests.length,
    remaining: Math.max(0, limit - validRequests.length),
    resetAt,
  };
}

// Reset rate limit for a user (admin function)
export async function resetRateLimit(env: Env, userId: string): Promise<void> {
  const key = `${RATE_LIMIT_PREFIX}${userId}`;
  await env.KV.delete(key);
}

// Add rate limit headers to response
export function addRateLimitHeaders(
  response: Response,
  result: RateLimitResult
): Response {
  const headers = new Headers(response.headers);
  headers.set('X-RateLimit-Remaining', String(result.remaining));
  headers.set('X-RateLimit-Reset', String(Math.floor(result.resetAt / 1000)));
  
  if (!result.allowed) {
    headers.set('Retry-After', String(Math.ceil((result.resetAt - Date.now()) / 1000)));
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
