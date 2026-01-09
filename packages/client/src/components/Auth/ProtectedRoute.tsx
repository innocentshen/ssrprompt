/**
 * Protected Route Component - handles route protection based on auth state
 */
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireRoles?: string[];
  allowDemo?: boolean;
}

/**
 * Loading screen component
 */
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <div className="text-slate-400">Loading...</div>
      </div>
    </div>
  );
}

/**
 * Protected Route
 * Redirects to login page if user is not authenticated
 */
export function ProtectedRoute({
  children,
  requireAuth = true,
  requireRoles,
  allowDemo = true,
}: ProtectedRouteProps) {
  const { isAuthenticated, isDemo, user, isLoading } = useAuthStore();
  const location = useLocation();

  // Show loading screen while initializing
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Check if authentication is required
  if (requireAuth && !isAuthenticated) {
    // Redirect to login with return URL
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check if demo mode is allowed
  if (!allowDemo && isDemo) {
    return (
      <Navigate
        to="/login"
        state={{ from: location, message: '此功能需要注册账户' }}
        replace
      />
    );
  }

  // Check if specific roles are required
  if (requireRoles && requireRoles.length > 0 && user) {
    const userRoles = user.roles || [];
    const hasRequiredRole = requireRoles.some((role) => userRoles.includes(role));

    if (!hasRequiredRole) {
      // Redirect to unauthorized page or home
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}

/**
 * Public Route
 * Redirects to home if user is already authenticated
 */
export function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  // Show loading screen while initializing
  if (isLoading) {
    return <LoadingScreen />;
  }

  // If authenticated, redirect to the page they came from or home
  if (isAuthenticated) {
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
