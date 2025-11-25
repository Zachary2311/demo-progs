import { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';

// Cookie parser middleware
export const configureCookies = cookieParser();

// Extract token from cookie or Authorization header
export const extractToken = (req: Request): string | null => {
  // First check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Fallback to cookie
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }

  return null;
};
