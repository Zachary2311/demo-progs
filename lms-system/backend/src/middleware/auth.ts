import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        discordId: string;
        roles: string[];
      };
    }
  }
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    throw new AppError(401, 'No authorization token provided');
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'default-secret'
    ) as any;
    req.user = decoded;
    next();
  } catch (error) {
    throw new AppError(401, 'Invalid or expired token');
  }
};

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }

    const hasRole = req.user.roles.some(role => roles.includes(role));
    if (!hasRole) {
      throw new AppError(403, 'Insufficient permissions');
    }

    next();
  };
};
