import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff, AlertCircle, Sun, Moon } from 'lucide-react';
import { Button, Input, useToast } from '../components/ui';
import { LanguageSwitcher } from '../components/Layout/LanguageSwitcher';
import { GitHubStar } from '../components/Layout/GitHubStar';
import { useTheme } from '../contexts';
import { authApi } from '../api/auth';

const RESEND_SECONDS = 60;

export function ForgotPasswordPage() {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Get redirect path from location state (same structure as LoginPage)
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const sendCode = async () => {
    setLocalError(null);

    if (!email) {
      setLocalError('请输入邮箱');
      return;
    }

    setIsSendingCode(true);
    try {
      await authApi.forgotPassword({ email });
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

    if (!email || !code || !newPassword) {
      setLocalError('请填写邮箱、验证码和新密码');
      return;
    }

    if (newPassword !== confirmPassword) {
      setLocalError('两次输入的密码不一致');
      return;
    }
    if (newPassword.length < 8) {
      setLocalError('密码至少需要8个字符');
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setLocalError('密码必须包含大小写字母和数字');
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.resetPassword({ email, code, newPassword });
      showToast('success', '密码已重置，请使用新密码登录');
      navigate('/login', { replace: true, state: { from: { pathname: from } } });
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : '重置失败');
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <p className="text-slate-400 dark:text-slate-400 light:text-slate-600">重置密码</p>
        </div>

        <div className="bg-slate-800/50 dark:bg-slate-800/50 light:bg-white/80 backdrop-blur-sm border border-slate-700 dark:border-slate-700 light:border-slate-200 rounded-xl p-8 shadow-2xl">
          {localError && (
            <div className="flex items-center gap-2 p-3 mb-6 bg-rose-950/30 dark:bg-rose-950/30 light:bg-rose-50 border border-rose-900/50 dark:border-rose-900/50 light:border-rose-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-rose-400 dark:text-rose-400 light:text-rose-500 flex-shrink-0" />
              <p className="text-sm text-rose-300 dark:text-rose-300 light:text-rose-600">{localError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
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

            {/* Code */}
            <div>
              <label className="block text-sm font-medium text-slate-300 dark:text-slate-300 light:text-slate-700 mb-2">
                验证码
              </label>
              <div className="relative">
                <Input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full pr-28"
                  placeholder="请输入6位验证码"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={isSendingCode || countdown > 0}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs font-medium rounded-md bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSendingCode ? '发送中...' : countdown > 0 ? `重新发送(${countdown}s)` : '发送验证码'}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 dark:text-slate-300 light:text-slate-700 mb-2">
                新密码
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-10"
                  placeholder="至少8个字符"
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
              <p className="mt-1.5 text-xs text-slate-500">需包含大小写字母和数字</p>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 dark:text-slate-300 light:text-slate-700 mb-2">
                确认新密码
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10"
                  placeholder="再次输入新密码"
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting} loading={isSubmitting}>
              重置密码
            </Button>
          </form>

          <p className="mt-6 text-center text-slate-400 dark:text-slate-400 light:text-slate-600 text-sm">
            <button
              type="button"
              onClick={() => navigate('/login', { state: { from: { pathname: from } } })}
              className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
            >
              ← 返回登录
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;

