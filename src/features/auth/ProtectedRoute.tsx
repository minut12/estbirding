import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission?: string;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, permission, requireAdmin }: ProtectedRouteProps) {
  const { user, loading, hasPermission, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[100dvh] bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (permission && !hasPermission(permission) && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
