/**
 * Auth Store - manages authentication state
 */
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { authApi } from '../api/auth';
import { apiClient } from '../api/client';
import type { User, RegisterInput, LoginInput } from '@ssrprompt/shared';

const DEMO_EXPIRY_DAYS = 7;

interface AuthState {
  // State
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isDemo: boolean;
  isLoading: boolean;
  error: string | null;
  demoStartedAt: number | null; // timestamp when demo started

  // Actions
  login: (data: LoginInput) => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
  enterDemoMode: () => Promise<void>;
  fetchCurrentUser: () => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string | null) => void;
  clearAuth: () => void;
  clearError: () => void;
  initialize: () => Promise<void>;
  checkDemoExpiry: () => { expired: boolean; daysRemaining: number };
  resetDemo: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isDemo: false,
        isLoading: true,
        error: null,
        demoStartedAt: null,

        /**
         * Login with email and password
         */
        login: async (data: LoginInput) => {
          set({ isLoading: true, error: null });
          try {
            const response = await authApi.login(data);

            // Update state
            set({
              user: response.user,
              accessToken: response.accessToken,
              refreshToken: response.refreshToken,
              isAuthenticated: true,
              isDemo: false,
              isLoading: false,
            });

            // Update API client token
            apiClient.setToken(response.accessToken);
          } catch (error) {
            const message = error instanceof Error ? error.message : '登录失败';
            set({ error: message, isLoading: false });
            throw error;
          }
        },

        /**
         * Register new user
         */
        register: async (data: RegisterInput) => {
          set({ isLoading: true, error: null });
          try {
            const response = await authApi.register(data);

            // Update state
            set({
              user: response.user,
              accessToken: response.accessToken,
              refreshToken: response.refreshToken,
              isAuthenticated: true,
              isDemo: false,
              isLoading: false,
            });

            // Update API client token
            apiClient.setToken(response.accessToken);
          } catch (error) {
            const message = error instanceof Error ? error.message : '注册失败';
            set({ error: message, isLoading: false });
            throw error;
          }
        },

        /**
         * Logout
         */
        logout: async () => {
          const { refreshToken, isDemo } = get();

          // Clear state first for immediate UI update
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            isDemo: false,
            error: null,
          });

          // Clear API client token
          apiClient.clearToken();

          // If not demo, call logout API to invalidate refresh token
          if (!isDemo && refreshToken) {
            try {
              await authApi.logout(refreshToken);
            } catch (e) {
              // Ignore logout errors
              console.error('Logout error:', e);
            }
          }
        },

        /**
         * Refresh access token
         */
        refreshAccessToken: async () => {
          const { refreshToken, isDemo } = get();

          // Demo mode - get new demo token
          if (isDemo) {
            try {
              await get().enterDemoMode();
              return true;
            } catch {
              return false;
            }
          }

          // No refresh token
          if (!refreshToken) {
            return false;
          }

          try {
            const tokens = await authApi.refresh(refreshToken);

            set({
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
            });

            // Update API client token
            apiClient.setToken(tokens.accessToken);
            return true;
          } catch {
            // Refresh failed - clear auth
            get().clearAuth();
            return false;
          }
        },

        /**
         * Enter demo mode
         */
        enterDemoMode: async () => {
          set({ isLoading: true, error: null });
          try {
            const { token, user } = await authApi.getDemoToken();
            const now = Date.now();

            set({
              user: {
                id: user.id,
                email: '',
                status: 'active',
                emailVerified: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              accessToken: token,
              refreshToken: null,
              isAuthenticated: true,
              isDemo: true,
              isLoading: false,
              demoStartedAt: now,
            });

            // Update API client token
            apiClient.setToken(token);
          } catch (error) {
            const message = error instanceof Error ? error.message : '初始化失败';
            set({ error: message, isLoading: false });
            throw error;
          }
        },

        /**
         * Fetch current user info
         */
        fetchCurrentUser: async () => {
          const { isDemo } = get();
          if (isDemo) return;

          try {
            const user = await authApi.getMe();
            set({ user });
          } catch {
            // If fetching user fails, the token might be invalid
            get().clearAuth();
          }
        },

        /**
         * Set tokens directly (for token refresh)
         */
        setTokens: (accessToken: string, refreshToken: string | null) => {
          set({ accessToken, refreshToken });
          apiClient.setToken(accessToken);
        },

        /**
         * Clear all auth state
         */
        clearAuth: () => {
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            isDemo: false,
            error: null,
            demoStartedAt: null,
          });
          apiClient.clearToken();
        },

        /**
         * Clear error
         */
        clearError: () => {
          set({ error: null });
        },

        /**
         * Check if demo has expired
         */
        checkDemoExpiry: () => {
          const { isDemo, demoStartedAt } = get();

          if (!isDemo || !demoStartedAt) {
            return { expired: false, daysRemaining: DEMO_EXPIRY_DAYS };
          }

          const now = Date.now();
          const expiryTime = demoStartedAt + DEMO_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
          const expired = now >= expiryTime;
          const msRemaining = Math.max(0, expiryTime - now);
          const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

          return { expired, daysRemaining };
        },

        /**
         * Reset demo - clear data and start fresh
         */
        resetDemo: async () => {
          get().clearAuth();
          await get().enterDemoMode();
        },

        /**
         * Initialize auth state on app load
         */
        initialize: async () => {
          set({ isLoading: true });

          const { accessToken, refreshToken, isDemo } = get();

          // No tokens - not authenticated
          if (!accessToken) {
            set({ isLoading: false, isAuthenticated: false });
            return;
          }

          // Restore API client token
          apiClient.setToken(accessToken);

          // For demo mode, just mark as authenticated
          if (isDemo) {
            set({
              isLoading: false,
              isAuthenticated: true,
            });
            return;
          }

          // For regular users, try to fetch user info
          try {
            const user = await authApi.getMe();
            set({
              user,
              isLoading: false,
              isAuthenticated: true,
            });
          } catch {
            // Token might be expired, try to refresh
            if (refreshToken) {
              const refreshed = await get().refreshAccessToken();
              if (refreshed) {
                try {
                  const user = await authApi.getMe();
                  set({
                    user,
                    isLoading: false,
                    isAuthenticated: true,
                  });
                  return;
                } catch {
                  // Still failed, clear auth
                }
              }
            }

            // Clear auth and set as not authenticated
            get().clearAuth();
            set({ isLoading: false });
          }
        },
      }),
      {
        name: 'auth-storage',
        // Only persist these fields
        partialize: (state) => ({
          accessToken: state.accessToken,
          refreshToken: state.refreshToken,
          isDemo: state.isDemo,
          user: state.user,
          demoStartedAt: state.demoStartedAt,
        }),
      }
    ),
    { name: 'auth-store' }
  )
);

export default useAuthStore;
