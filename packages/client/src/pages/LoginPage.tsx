/**
 * Login Page - handles user login, registration, and demo mode entry
 */
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, AlertCircle, Github, Star, Sun, Moon, Eye, EyeOff, Mail, User as UserIcon } from 'lucide-react';
import { Button, Input } from '../components/ui';
import { LanguageSwitcher } from '../components/Layout/LanguageSwitcher';
import { GitHubStar } from '../components/Layout/GitHubStar';
import { useTheme } from '../contexts';
import { useAuthStore } from '../store/useAuthStore';

type AuthMode = 'login' | 'register';

export function LoginPage() {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, enterDemoMode, isLoading, error, clearError } = useAuthStore();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Get redirect path from location state
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

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
        await register({ email, password, name: name || undefined });
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
    setMode(mode === 'login' ? 'register' : 'login');
    setLocalError(null);
    clearError();
    setPassword('');
    setConfirmPassword('');
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
              <span className="px-4 bg-slate-800/50 dark:bg-slate-800/50 light:bg-white/80 text-slate-400">或</span>
            </div>
          </div>

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
