import { compare, hash } from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import type { Env, User, AuthPayload } from '../types';

const SALT_ROUNDS = 10;
const JWT_EXPIRY = '7d';

// Hash password using bcrypt
export async function hashPassword(password: string): Promise<string> {
  return hash(password, SALT_ROUNDS);
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return compare(password, hash);
}

// Generate JWT token
export async function generateToken(user: User, env: Env): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  
  const token = await new SignJWT({
    userId: user.id,
    email: user.email,
    isAdmin: user.is_admin === 1,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(secret);

  return token;
}

// Verify JWT token
export async function verifyToken(token: string, env: Env): Promise<AuthPayload | null> {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      isAdmin: payload.isAdmin as boolean,
      exp: payload.exp as number,
    };
  } catch {
    return null;
  }
}

// Generate random token for email verification / password reset
export function generateRandomToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Generate UUID v4
export function generateId(): string {
  return crypto.randomUUID();
}

// Extract token from Authorization header
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

// Get user from request
export async function getUserFromRequest(
  request: Request,
  env: Env
): Promise<AuthPayload | null> {
  const authHeader = request.headers.get('Authorization');
  const token = extractBearerToken(authHeader);
  
  if (!token) {
    // Try cookie
    const cookie = request.headers.get('Cookie');
    if (cookie) {
      const match = cookie.match(/auth_token=([^;]+)/);
      if (match) {
        return verifyToken(match[1], env);
      }
    }
    return null;
  }
  
  return verifyToken(token, env);
}

// Create auth cookie
export function createAuthCookie(token: string, maxAge: number = 7 * 24 * 60 * 60): string {
  return `auth_token=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}; Path=/`;
}

// Clear auth cookie
export function clearAuthCookie(): string {
  return 'auth_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/';
}
