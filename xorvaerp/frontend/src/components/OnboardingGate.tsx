import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../stores/AuthContext';
import { tenantsApi } from '../api/tenants.api';
import { FullPageSpinner } from './ui';

/**
 * On the post-login landing, sends a CEO (SuperAdmin) whose tenant hasn't been
 * onboarded to the first-login wizard. Other roles pass straight through.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<'loading' | 'ok' | 'needs'>('loading');

  useEffect(() => {
    if (user?.role !== 'SuperAdmin') {
      setState('ok');
      return;
    }
    tenantsApi
      .currentTenant()
      .then((r) => setState(r.data.data?.onboardedAt ? 'ok' : 'needs'))
      .catch(() => setState('ok'));
  }, [user]);

  if (state === 'loading') return <FullPageSpinner />;
  if (state === 'needs') return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}
