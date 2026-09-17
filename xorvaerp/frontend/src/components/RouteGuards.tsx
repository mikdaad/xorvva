import { Navigate } from 'react-router-dom';
import { useAuth } from '../stores/AuthContext';
import { FullPageSpinner } from './ui';

/**
 * Protects routes that require authentication.
 * Shows spinner while auth state is loading, redirects to /login if not authenticated.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <FullPageSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

/**
 * Redirects authenticated users away from the login page.
 */
export function GuestRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <FullPageSpinner />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
