import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes } from 'crypto';
import { env } from '../config/env.js';
import { usersRepository, sessionsRepository, type UserWithRoles } from '../repositories/users.repository.js';
import { UnauthorizedError, ConflictError, NotFoundError } from '@ssrprompt/shared';
import type { User, AuthResponse, TokenPair, JwtPayload } from '@ssrprompt/shared';

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

/**
 * Auth Service - handles authentication logic
 */
export class AuthService {
  /**
   * Register a new user with email/password
   */
  async register(data: {
    email: string;
    password: string;
    name?: string;
  }): Promise<AuthResponse> {
    // Check if email already exists
    const existingUser = await usersRepository.findByEmail(data.email);
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    // Create user with default role
    const user = await usersRepository.createWithRole(
      {
        email: data.email,
        passwordHash,
        name: data.name,
      },
      'user'
    );

    // Generate tokens
    const tokens = await this.generateTokenPair(user);

    return {
      user: this.formatUser(user),
      ...tokens,
    };
  }

  /**
   * Login with email/password
   */
  async login(
    email: string,
    password: string,
    meta?: { userAgent?: string; ipAddress?: string }
  ): Promise<AuthResponse> {
    // Find user
    const user = await usersRepository.findByEmailWithRoles(email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check if user has password (not OAuth-only user)
    if (!user.passwordHash) {
      throw new UnauthorizedError('Please login with your social account');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check user status
    if (user.status === 'suspended') {
      throw new UnauthorizedError('账号已被禁用，请联系管理员');
    }
    if (user.status === 'inactive') {
      throw new UnauthorizedError('账号未激活');
    }

    // Update last login
    await usersRepository.updateLastLogin(user.id);

    // Generate tokens
    const tokens = await this.generateTokenPair(user, meta);

    return {
      user: this.formatUser(user),
      ...tokens,
    };
  }

  /**
   * Logout - invalidate refresh token
   */
  async logout(refreshToken: string): Promise<void> {
    await sessionsRepository.deleteByRefreshToken(refreshToken);
  }

  /**
   * Logout all sessions for a user
   */
  async logoutAll(userId: string): Promise<number> {
    return sessionsRepository.deleteAllByUserId(userId);
  }

  /**
   * Refresh access token
   */
  async refreshTokens(
    refreshToken: string,
    meta?: { userAgent?: string; ipAddress?: string }
  ): Promise<TokenPair> {
    // Find session
    const session = await sessionsRepository.findByRefreshToken(refreshToken);
    if (!session) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Check if expired
    if (session.expiresAt < new Date()) {
      await sessionsRepository.deleteByRefreshToken(refreshToken);
      throw new UnauthorizedError('Refresh token expired');
    }

    // Get user with roles
    const user = await usersRepository.findByIdWithRoles(session.userId);
    if (!user || user.status !== 'active') {
      await sessionsRepository.deleteByRefreshToken(refreshToken);
      throw new UnauthorizedError('User not found or inactive');
    }

    // Delete old session
    await sessionsRepository.deleteByRefreshToken(refreshToken);

    // Generate new token pair
    return this.generateTokenPair(user, meta);
  }

  /**
   * Get current user info
   */
  async getCurrentUser(userId: string): Promise<User> {
    const user = await usersRepository.findByIdWithRoles(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    return this.formatUser(user);
  }

  /**
   * Change password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }

    if (!user.passwordHash) {
      throw new UnauthorizedError('Cannot change password for social login accounts');
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    await usersRepository.update(userId, { passwordHash: newPasswordHash });

    // Invalidate all sessions
    await sessionsRepository.deleteAllByUserId(userId);
  }

  /**
   * Generate demo token
   */
  generateDemoToken(): { token: string; userId: string } {
    const userId = `demo_${randomUUID()}`;
    const payload: Partial<JwtPayload> = {
      userId,
      tenantType: 'demo',
      isDemo: true,
    };

    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
    return { token, userId };
  }

  /**
   * Generate access token and refresh token
   */
  private async generateTokenPair(
    user: UserWithRoles,
    meta?: { userAgent?: string; ipAddress?: string }
  ): Promise<TokenPair> {
    const roles = user.roles.map((r) => r.role.name);

    // Access token
    const accessTokenPayload: Partial<JwtPayload> = {
      userId: user.id,
      email: user.email,
      tenantType: 'personal',
      isDemo: false,
      roles,
    };

    const accessToken = jwt.sign(accessTokenPayload, env.JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    // Refresh token
    const refreshToken = randomBytes(64).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    // Save session
    await sessionsRepository.create({
      userId: user.id,
      refreshToken,
      userAgent: meta?.userAgent,
      ipAddress: meta?.ipAddress,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken,
      expiresAt: expiresAt.getTime(),
    };
  }

  /**
   * Format user for API response
   */
  private formatUser(user: UserWithRoles): User {
    return {
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      avatar: user.avatar ?? undefined,
      status: user.status,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString(),
      roles: user.roles.map((r) => r.role.name),
    };
  }
}

// Export singleton instance
export const authService = new AuthService();
