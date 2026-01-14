// User Status
export type UserStatus = 'active' | 'inactive' | 'suspended';

// Tenant Type
export type TenantType = 'demo' | 'personal';

// User
export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  roles?: string[];
}

// Role
export interface Role {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  createdAt: string;
}

// Permission
export interface Permission {
  id: string;
  name: string;
  description?: string;
  resource: string;
  action: string;
}

// JWT Payload
export interface JwtPayload {
  userId: string;
  email?: string;
  tenantType: TenantType;
  isDemo: boolean;
  roles?: string[];
  iat: number;
  exp: number;
}

// Auth Response (for login/register)
export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// Token Pair (for refresh)
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// Demo Token Response
export interface DemoTokenResponse {
  token: string;
  user: {
    id: string;
    tenantType: 'demo';
  };
}

// Session Info
export interface SessionInfo {
  id: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

// Email verification
export type EmailVerificationType = 'register' | 'reset_password';

// OAuth providers
export type OAuthProvider = 'google' | 'linuxdo';

export interface AuthConfig {
  allowRegistration: boolean;
  requireEmailVerification: boolean;
  oauth: {
    google: { enabled: boolean };
    linuxdo: { enabled: boolean };
  };
}

export interface SendCodeResponse {
  success: true;
  expiresIn: number;
}
