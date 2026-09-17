import { useCallback, useEffect, useState } from 'react';
import { IconApps, IconCheck, IconPlus } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { modulesApi, type ModuleCatalogEntry, type TenantSubscription } from '../../api/modules.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, Spinner } from '../../components/ui';
import { PageHeader } from '../../components/dashboard-ui';
import { roleLevel } from '../../utils/roles';

const apiError = (err: unknown, fallback: string) => {
  const ax = err as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? fallback;
};

export default function ModulesPage() {
  const { user } = useAuth();
  const { reloadCompanies } = useCompany();
  const toast = useToast();
  const canManage = user ? roleLevel(user.role) <= 1 : false; // SuperAdmin / SystemAdmin

  const [sub, setSub] = useState<TenantSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await modulesApi.getSubscription();
      setSub(res.data.data ?? null);
    } catch (err) {
      setError(apiError(err, 'Failed to load modules.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (m: ModuleCatalogEntry) => {
    if (!canManage || !sub) return;
    const next = m.isSubscribed
      ? sub.subscribedModules.filter((k) => k !== m.key)
      : [...sub.subscribedModules, m.key];
    setSaving(m.key);
    try {
      const res = await modulesApi.setSubscription(next);
      setSub(res.data.data ?? null);
      // Subscription changes company activation too — refresh so the sidebar reflects it now.
      await reloadCompanies();
      toast.success(m.isSubscribed ? `${m.displayName} turned off.` : `${m.displayName} turned on.`);
    } catch (err) {
      toast.error(apiError(err, 'Failed to update subscription.'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Modules"
        subtitle="Choose which modules your organization uses. Turn one on to make it available to your companies."
        action={sub && (
          <span className="rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-semibold text-glow">
            Plan: {sub.planKey}
          </span>
        )}
      />

      {error && <Alert kind="error">{error}</Alert>}
      {!canManage && !loading && (
        <div className="mb-4">
          <Alert kind="success">Only the organization owner (CEO) can change the subscription. You have read-only access.</Alert>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sub?.availableModules.map((m) => (
            <Card key={m.key} className={`transition-all hover:-translate-y-0.5 hover:shadow-soft ${m.isSubscribed ? 'border-primary/40' : ''}`}>
              <div className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${m.isSubscribed ? 'bg-linear-to-br from-brand-2/25 to-primary/20 text-glow' : 'bg-surface text-dim'}`}>
                      <IconApps size={22} stroke={1.5} />
                    </div>
                    <div>
                      <div className="font-semibold text-frost">{m.displayName}</div>
                      {m.isSubscribed && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                          <IconCheck size={13} stroke={2.2} /> Active
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <p className="mt-3 flex-1 text-sm text-frost-dim">{m.description}</p>

                {m.dependsOn.length > 0 && (
                  <p className="mt-2 text-xs text-dim">Requires: {m.dependsOn.join(', ')}</p>
                )}

                <div className="mt-4">
                  <Button
                    block
                    variant={m.isSubscribed ? 'secondary' : 'primary'}
                    disabled={!canManage}
                    loading={saving === m.key}
                    onClick={() => void toggle(m)}
                  >
                    {m.isSubscribed ? 'Turn off' : (<><IconPlus size={16} stroke={1.8} /> Turn on</>)}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-dim">
        Turning a module off removes it from any company currently using it. Some modules require another
        (e.g. a module that posts to the ledger needs Accounting) — dependencies are added automatically.
      </p>
    </AppShell>
  );
}
