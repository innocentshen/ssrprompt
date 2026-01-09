/**
 * Auth API Client
 */
import { apiClient } from './client';
import type {
  AuthResponse,
  TokenPair,
  User,
  RegisterInput,
  LoginInput,
  DemoTokenResponse,
} from '@ssrprompt/shared';

export const authApi = {
  /**
   * Register a new user
   */
  register: (data: RegisterInput): Promise<AuthResponse> =>
    apiClient.post<AuthResponse>('/auth/register', data),

  /**
   * Login with email and password
   */
  login: (data: LoginInput): Promise<AuthResponse> =>
    apiClient.post<AuthResponse>('/auth/login', data),

  /**
   * Logout - invalidate refresh token
   */
  logout: (refreshToken: string): Promise<{ success: boolean }> =>
    apiClient.post<{ success: boolean }>('/auth/logout', { refreshToken }),

  /**
   * Refresh access token
   */
  refresh: (refreshToken: string): Promise<TokenPair> =>
    apiClient.post<TokenPair>('/auth/refresh', { refreshToken }),

  /**
   * Get current user info
   */
  getMe: (): Promise<User> => apiClient.get<User>('/auth/me'),

  /**
   * Get demo token
   */
  getDemoToken: (): Promise<DemoTokenResponse> =>
    apiClient.get<DemoTokenResponse>('/auth/demo-token'),

  /**
   * Change password
   */
  changePassword: (
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean }> =>
    apiClient.post<{ success: boolean }>('/auth/change-password', {
      currentPassword,
      newPassword,
    }),
};

export default authApi;
