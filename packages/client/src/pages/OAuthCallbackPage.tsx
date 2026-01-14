import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lock, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

export function OAuthCallbackPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { loginWithTokens } = useAuthStore();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(location.search);
      const oauthError = params.get('error');
      if (oauthError) {
        setError(oauthError);
        return;
      }

      const accessToken = params.get('accessToken');
      const refreshToken = params.get('refreshToken');
      const from = params.get('from') || '/';

      if (!accessToken || !refreshToken) {
        setError('OAuth 登录失败：缺少令牌');
        return;
      }

      try {
        await loginWithTokens(accessToken, refreshToken);
        navigate(from.startsWith('/') ? from : '/', { replace: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'OAuth 登录失败');
      }
    };

    run();
  }, [location.search, loginWithTokens, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-cyan-500/10 rounded-2xl mb-4">
            <Lock className="w-8 h-8 text-cyan-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">SSRPrompt</h1>
          <p className="text-slate-400">正在完成登录...</p>
        </div>

        {error ? (
          <div className="flex items-center gap-2 p-3 bg-rose-950/30 border border-rose-900/50 rounded-lg">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <p className="text-sm text-rose-300">{error}</p>
          </div>
        ) : (
          <div className="text-center text-slate-300">
            <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            请稍候...
          </div>
        )}
      </div>
    </div>
  );
}

export default OAuthCallbackPage;

