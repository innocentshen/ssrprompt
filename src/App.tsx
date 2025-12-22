import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/ui';
import { ThemeProvider } from './contexts';
import { SettingsPage, PromptsPage, EvaluationPage, TracesPage, HomePage, PromptWizardPage } from './pages';
import { LoginPage } from './pages/LoginPage';
import { SetupWizard } from './components/Setup';
import { getStoredConfig, initializeDatabase, getDatabase } from './lib/database';

const pageTitles: Record<string, string> = {
  home: '首页',
  wizard: 'Prompt 创建向导',
  prompts: 'Prompt 开发',
  evaluation: '评测中心',
  traces: '历史记录',
  settings: '设置',
};

const AUTH_KEY = 'ai_compass_auth';

function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isCheckingDb, setIsCheckingDb] = useState(true);

  useEffect(() => {
    const storedAuth = localStorage.getItem(AUTH_KEY);
    if (storedAuth === import.meta.env.VITE_APP_PASSWORD) {
      setIsAuthenticated(true);
    }
    setIsCheckingAuth(false);
  }, []);

  useEffect(() => {
    const checkDatabaseConfig = async () => {
      const config = getStoredConfig();

      // Check if configuration is incomplete
      if (config.provider === 'supabase') {
        // Check if Supabase is configured via stored config or env vars
        const hasStoredConfig = config.supabase?.url && config.supabase?.anonKey;
        const hasEnvConfig = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!hasStoredConfig && !hasEnvConfig) {
          setNeedsSetup(true);
          setIsCheckingDb(false);
          return;
        }
      } else if (config.provider === 'mysql') {
        if (!config.mysql?.host || !config.mysql?.database) {
          setNeedsSetup(true);
          setIsCheckingDb(false);
          return;
        }
      }

      // Try to test the connection
      try {
        const db = initializeDatabase(config);
        const result = await db.testConnection();
        if (!result.success) {
          setNeedsSetup(true);
        }
      } catch {
        setNeedsSetup(true);
      }

      setIsCheckingDb(false);
    };

    if (isAuthenticated) {
      checkDatabaseConfig();
    } else {
      setIsCheckingDb(false);
    }
  }, [isAuthenticated]);

  const handleLogin = (password: string) => {
    localStorage.setItem(AUTH_KEY, password);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem(AUTH_KEY);
    setIsAuthenticated(false);
    setCurrentPage('home');
  };

  const handleSetupComplete = () => {
    setNeedsSetup(false);
    // Reinitialize database with new config
    initializeDatabase();
  };

  if (isCheckingAuth || isCheckingDb) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">加载中...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <ThemeProvider>
        <ToastProvider>
          <LoginPage onLogin={handleLogin} />
        </ToastProvider>
      </ThemeProvider>
    );
  }

  if (needsSetup) {
    return (
      <ThemeProvider>
        <ToastProvider>
          <SetupWizard onComplete={handleSetupComplete} />
        </ToastProvider>
      </ThemeProvider>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage onNavigate={setCurrentPage} />;
      case 'wizard':
        return <PromptWizardPage onNavigate={setCurrentPage} />;
      case 'prompts':
        return <PromptsPage />;
      case 'evaluation':
        return <EvaluationPage />;
      case 'traces':
        return <TracesPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <HomePage onNavigate={setCurrentPage} />;
    }
  };

  return (
    <ThemeProvider>
      <ToastProvider>
        <Layout
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          title={pageTitles[currentPage]}
          onLogout={handleLogout}
        >
          {renderPage()}
        </Layout>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
