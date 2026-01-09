import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { env } from '../config/env.js';
import { UnauthorizedError, TokenExpiredError, ForbiddenError } from '@ssrprompt/shared';

export interface JwtPayload {
  userId: string;
  email?: string;
  tenantType: 'demo' | 'personal';
  isDemo: boolean;
  roles?: string[];
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Generate a JWT token
 */
export function generateToken(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  expiresIn = '7d'
): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

/**
 * Generate a demo token with a random user ID
 */
export function generateDemoToken(): { token: string; userId: string } {
  const userId = `demo_${randomUUID()}`;
  const token = generateToken(
    {
      userId,
      tenantType: 'demo',
      isDemo: true,
    },
    '7d'
  );
  return { token, userId };
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

/**
 * Authentication middleware
 * Validates JWT token and attaches user info to request
 */
export function authenticateJWT(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing authorization header'));
  }

  const token = authHeader.substring(7);

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new TokenExpiredError());
    }
    return next(new UnauthorizedError('Invalid token'));
  }
}

/**
 * Optional authentication middleware
 * Attaches user info if token is present, but doesn't require it
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const payload = verifyToken(token);
    req.user = payload;
  } catch {
    // Ignore token errors for optional auth
  }

  next();
}

/**
 * Middleware to require a specific tenant type
 */
export function requireTenantType(type: 'demo' | 'personal') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }

    if (req.user.tenantType !== type) {
      return next(new UnauthorizedError(`This action requires ${type} account`));
    }

    next();
  };
}

/**
 * Middleware to require specific roles
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }

    // Demo users don't have roles
    if (req.user.isDemo) {
      return next(new ForbiddenError('This action requires a registered account'));
    }

    const userRoles = req.user.roles || [];
    const hasRole = roles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return next(new ForbiddenError(`Required role: ${roles.join(' or ')}`));
    }

    next();
  };
}

/**
 * Middleware to check if user is not demo
 */
export function requireRegisteredUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new UnauthorizedError());
  }

  if (req.user.isDemo) {
    return next(new ForbiddenError('This action requires a registered account'));
  }

  next();
}
