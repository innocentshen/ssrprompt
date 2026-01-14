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
  AuthConfig,
  SendCodeInput,
  SendCodeResponse,
  ForgotPasswordInput,
  ResetPasswordInput,
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

  /**
   * Get public auth config
   */
  getConfig: (): Promise<AuthConfig> =>
    apiClient.get<AuthConfig>('/auth/config'),

  /**
   * Send verification code (register/reset_password)
   */
  sendCode: (data: SendCodeInput): Promise<SendCodeResponse> =>
    apiClient.post<SendCodeResponse>('/auth/send-code', data),

  /**
   * Forgot password (send reset code)
   */
  forgotPassword: (data: ForgotPasswordInput): Promise<SendCodeResponse> =>
    apiClient.post<SendCodeResponse>('/auth/forgot-password', data),

  /**
   * Reset password (verify code + set new password)
   */
  resetPassword: (data: ResetPasswordInput): Promise<{ success: boolean }> =>
    apiClient.post<{ success: boolean }>('/auth/reset-password', data),
};

export default authApi;
