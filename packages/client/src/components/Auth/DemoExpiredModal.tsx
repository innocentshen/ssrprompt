/**
 * Demo Expired Modal - shows when demo period has expired
 */
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, UserPlus, RefreshCw } from 'lucide-react';
import { Button } from '../ui';
import { useAuthStore } from '../../store/useAuthStore';

interface DemoExpiredModalProps {
  onClose?: () => void;
}

export function DemoExpiredModal({ onClose }: DemoExpiredModalProps) {
  const navigate = useNavigate();
  const { resetDemo, logout } = useAuthStore();

  const handleRegister = async () => {
    await logout();
    navigate('/login');
    onClose?.();
  };

  const handleResetDemo = async () => {
    await resetDemo();
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl border border-slate-700">
        {/* Icon */}
        <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-white text-center mb-3">
          Demo 已过期
        </h2>

        {/* Description */}
        <p className="text-slate-400 text-center mb-8">
          您的 Demo 试用期已结束，数据将被清理。
          <br />
          注册账号可永久保存您的数据。
        </p>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            onClick={handleRegister}
            className="w-full flex items-center justify-center gap-2"
          >
            <UserPlus className="w-5 h-5" />
            注册账号
          </Button>

          <button
            onClick={handleResetDemo}
            className="w-full py-3 px-4 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-5 h-5" />
            重新开始 Demo（数据清空）
          </button>
        </div>
      </div>
    </div>
  );
}

export default DemoExpiredModal;
