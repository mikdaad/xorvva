import { useEffect, useState } from 'react';
import { IconHistory } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { approvalsApi, STATUS_STYLES, type ApprovalRequest } from '../../api/approvals.api';
import type { ApiResponse } from '../../api/auth.api';
import { AppShell } from '../../components/AppShell';
import { Alert, Card, Spinner } from '../../components/ui';
import { StepChain } from './StepChain';

export default function ApprovalHistoryPage() {
  const [items, setItems] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    approvalsApi
      .history()
      .then((res) => setItems(res.data.data ?? []))
      .catch((err) => {
        const ax = err as AxiosError<ApiResponse<never>>;
        setError(ax.response?.data?.message ?? 'Failed to load history.');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-[26px] font-bold tracking-tight text-frost">Approval History</h1>
        <p className="mt-1 text-sm text-frost-dim">Full audit trail of every approval request.</p>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <Card className="py-14 text-center">
          <IconHistory size={36} stroke={1.2} className="mx-auto mb-3 text-dim" />
          <p className="text-frost-dim">No approval requests yet.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((req) => (
            <Card key={req.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-frost">{req.title}</span>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[req.status]}`}>
                      {req.status === 'ApprovedButFailed' ? 'Approved · Failed' : req.status}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm text-frost-dim">
                    By {req.requesterEmail} · {new Date(req.createdAt).toLocaleString()}
                  </div>
                  {req.outcome && <div className="mt-1 text-sm text-dim">{req.outcome}</div>}
                  <div className="mt-3"><StepChain steps={req.steps} /></div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
