/**
 * Login Page - handles user login, registration, and demo mode entry
 */
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, AlertCircle, Github, Star, Sun, Moon, Eye, EyeOff, Mail, User as UserIcon } from 'lucide-react';
import { Button, Input, useToast } from '../components/ui';
import { LanguageSwitcher } from '../components/Layout/LanguageSwitcher';
import { GitHubStar } from '../components/Layout/GitHubStar';
import { useTheme } from '../contexts';
import { useAuthStore } from '../store/useAuthStore';
import { authApi } from '../api/auth';

type AuthMode = 'login' | 'register';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';
const RESEND_SECONDS = 60;

export function LoginPage() {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, enterDemoMode, isLoading, error, clearError } = useAuthStore();
  const { showToast } = useToast();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [requireEmailVerification, setRequireEmailVerification] = useState(false);
  const [oauthEnabled, setOauthEnabled] = useState({ google: false, linuxdo: false });
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Fetch auth config on mount
  useEffect(() => {
    authApi
      .getConfig()
      .then((config) => {
        setAllowRegistration(config.allowRegistration);
        setRequireEmailVerification(config.requireEmailVerification);
        setOauthEnabled({
          google: !!config.oauth?.google?.enabled,
          linuxdo: !!config.oauth?.linuxdo?.enabled,
        });
      })
      .catch(() => {
        // Default to allowing registration if config fetch fails
        setAllowRegistration(true);
        setRequireEmailVerification(false);
        setOauthEnabled({ google: false, linuxdo: false });
      });
  }, []);

  // Get redirect path from location state
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  const hasOAuth = mode === 'login' && (oauthEnabled.google || oauthEnabled.linuxdo);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const startOAuth = (provider: 'google' | 'linuxdo') => {
    const redirect = new URL('/oauth/callback', window.location.origin);
    redirect.searchParams.set('from', from);
    window.location.href = `${API_BASE_URL}/auth/oauth/${provider}?redirect=${encodeURIComponent(
      redirect.toString()
    )}`;
  };

  const sendRegisterCode = async () => {
    setLocalError(null);
    clearError();

    if (!email) {
      setLocalError('请输入邮箱');
      return;
    }

    setIsSendingCode(true);
    try {
      await authApi.sendCode({ email, type: 'register' });
      setCountdown(RESEND_SECONDS);
      showToast('success', '验证码已发送，请检查邮箱');
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : '发送失败');
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    // Validation
    if (!email || !password) {
      setLocalError('请填写邮箱和密码');
      return;
    }

    if (mode === 'register') {
      if (requireEmailVerification && !verificationCode) {
        setLocalError('请输入邮箱验证码');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('两次输入的密码不一致');
        return;
      }
      if (password.length < 8) {
        setLocalError('密码至少需要8个字符');
        return;
      }
      if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
        setLocalError('密码必须包含大小写字母和数字');
        return;
      }
    }

    try {
      if (mode === 'login') {
        await login({ email, password });
      } else {
        await register({
          email,
          password,
          name: name || undefined,
          code: requireEmailVerification ? verificationCode : undefined,
        });
      }
      navigate(from, { replace: true });
    } catch {
      // Error is handled by store
    }
  };

  const handleDemoMode = async () => {
    setLocalError(null);
    clearError();

    try {
      await enterDemoMode();
      navigate(from, { replace: true });
    } catch {
      // Error is handled by store
    }
  };

  const switchMode = () => {
    // Check if registration is allowed when switching to register mode
    if (mode === 'login' && !allowRegistration) {
      setLocalError('管理员已关闭注册渠道');
      return;
    }
    setMode(mode === 'login' ? 'register' : 'login');
    setLocalError(null);
    clearError();
    setPassword('');
    setConfirmPassword('');
    setVerificationCode('');
    setCountdown(0);
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 light:from-slate-100 light:via-white light:to-slate-100 flex items-center justify-center p-4">
      {/* Top Right Controls */}
      <div className="fixed top-6 right-6 flex items-center gap-2">
        <GitHubStar />
        <LanguageSwitcher />

        <button
          onClick={toggleTheme}
          className="p-2 text-slate-400 dark:text-slate-400 light:text-slate-500 hover:text-white dark:hover:text-white light:hover:text-slate-900 hover:bg-slate-700/80 dark:hover:bg-slate-700/80 light:hover:bg-slate-200/80 rounded-lg transition-colors backdrop-blur-sm"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-cyan-500/10 rounded-2xl mb-4">
            <Lock className="w-8 h-8 text-cyan-400" />
          </div>
          <h1 className="text-3xl font-bold text-white dark:text-white light:text-slate-900 mb-2">SSRPrompt</h1>
          <p className="text-slate-400 dark:text-slate-400 light:text-slate-600">
            {mode === 'login' ? '登录您的账户' : '创建新账户'}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-slate-800/50 dark:bg-slate-800/50 light:bg-white/80 backdrop-blur-sm border border-slate-700 dark:border-slate-700 light:border-slate-200 rounded-xl p-8 shadow-2xl">
          {/* Error Message */}
          {displayError && (
            <div className="flex items-center gap-2 p-3 mb-6 bg-rose-950/30 dark:bg-rose-950/30 light:bg-rose-50 border border-rose-900/50 dark:border-rose-900/50 light:border-rose-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-rose-400 dark:text-rose-400 light:text-rose-500 flex-shrink-0" />
              <p className="text-sm text-rose-300 dark:text-rose-300 light:text-rose-600">{displayError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name (Register only) */}
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 dark:text-slate-300 light:text-slate-700 mb-2">
                  昵称 <span className="text-slate-500">(可选)</span>
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10"
                    placeholder="输入您的昵称"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-300 dark:text-slate-300 light:text-slate-700 mb-2">
                邮箱
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10"
                  placeholder="your@email.com"
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Verification Code (Register only, when enabled) */}
            {mode === 'register' && requireEmailVerification && (
              <div>
                <label className="block text-sm font-medium text-slate-300 dark:text-slate-300 light:text-slate-700 mb-2">
                  邮箱验证码
                </label>
                <div className="relative">
                  <Input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    className="w-full pr-28"
                    placeholder="请输入6位验证码"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                  />
                  <button
                    type="button"
                    onClick={sendRegisterCode}
                    disabled={isSendingCode || countdown > 0}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs font-medium rounded-md bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSendingCode
                      ? '发送中...'
                      : countdown > 0
                        ? `重新发送(${countdown}s)`
                        : '发送验证码'}
                  </button>
                </div>
              </div>
            )}

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 dark:text-slate-300 light:text-slate-700 mb-2">
                密码
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10"
                  placeholder={mode === 'register' ? '至少8个字符' : '输入密码'}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {mode === 'login' && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => navigate('/forgot-password', { state: { from: { pathname: from } } })}
                    className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-600 hover:text-cyan-400 transition-colors"
                  >
                    忘记密码？
                  </button>
                </div>
              )}
              {mode === 'register' && (
                <p className="mt-1.5 text-xs text-slate-500">
                  需包含大小写字母和数字
                </p>
              )}
            </div>

            {/* Confirm Password (Register only) */}
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 dark:text-slate-300 light:text-slate-700 mb-2">
                  确认密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10"
                    placeholder="再次输入密码"
                    required
                  />
                </div>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-600 dark:border-slate-600 light:border-slate-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-slate-800/50 dark:bg-slate-800/50 light:bg-white/80 text-slate-400">
                {hasOAuth ? '或使用以下方式继续' : '或'}
              </span>
            </div>
          </div>

          {/* OAuth Buttons (Login only) */}
          {hasOAuth && (
            <div
              className={`grid gap-3 mb-4 ${
                oauthEnabled.google && oauthEnabled.linuxdo ? 'grid-cols-2' : 'grid-cols-1'
              }`}
            >
              {oauthEnabled.google && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={isLoading}
                  onClick={() => startOAuth('google')}
                >
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Google
                </Button>
              )}
              {oauthEnabled.linuxdo && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={isLoading}
                  onClick={() => startOAuth('linuxdo')}
                >
                  <img src="/linuxdo-logo.ico" alt="Linux.do" className="w-5 h-5 mr-2" />
                  Linux.do
                </Button>
              )}
            </div>
          )}

          {/* Demo Mode Button */}
          <button
            type="button"
            onClick={handleDemoMode}
            disabled={isLoading}
            className="w-full py-3 px-4 bg-slate-700/50 dark:bg-slate-700/50 light:bg-slate-100 hover:bg-slate-700 dark:hover:bg-slate-700 light:hover:bg-slate-200 text-slate-300 dark:text-slate-300 light:text-slate-600 hover:text-white dark:hover:text-white light:hover:text-slate-900 font-medium rounded-lg border border-slate-600 dark:border-slate-600 light:border-slate-300 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="flex items-center justify-center gap-2">
              <Eye className="w-5 h-5" />
              试用 Demo 模式
            </span>
          </button>

          {/* Switch Mode */}
          <p className="mt-6 text-center text-slate-400 dark:text-slate-400 light:text-slate-600 text-sm">
            {mode === 'login' ? (
              <>
                还没有账户？{' '}
                <button
                  type="button"
                  onClick={switchMode}
                  className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
                >
                  立即注册
                </button>
              </>
            ) : (
              <>
                已有账户？{' '}
                <button
                  type="button"
                  onClick={switchMode}
                  className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
                >
                  立即登录
                </button>
              </>
            )}
          </p>
        </div>

        {/* GitHub Link */}
        <div className="mt-6 text-center">
          <a
            href="https://github.com/innocentshen/ssrprompt"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-slate-400 dark:text-slate-400 light:text-slate-500 hover:text-cyan-400 transition-colors duration-200"
          >
            <Github className="w-4 h-4" />
            <span>喜欢就给个 Star 吧</span>
            <Star className="w-4 h-4 text-yellow-500" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
