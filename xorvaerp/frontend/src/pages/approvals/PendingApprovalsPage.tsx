import { useCallback, useEffect, useState } from 'react';
import { IconInbox, IconUser, IconClock, IconTag } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { approvalsApi, ACTION_LABELS, type ApprovalRequest } from '../../api/approvals.api';
import type { ApiResponse } from '../../api/auth.api';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Modal, Spinner } from '../../components/ui';
import { Pill } from '../../components/dashboard-ui';
import { ROLE_LABELS } from '../../utils/roles';
import { StepChain } from './StepChain';

const apiError = (err: unknown, fallback: string) => {
  const ax = err as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? fallback;
};

const actionLabel = (key: string) => ACTION_LABELS[key] ?? key;
const fmtDate = (d: string) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function PendingApprovalsPage() {
  const toast = useToast();
  const [items, setItems] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<{ request: ApprovalRequest; mode: 'approve' | 'reject' } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await approvalsApi.pending();
      setItems(res.data.data ?? []);
    } catch (err) {
      toast.error(apiError(err, 'Failed to load pending approvals.'));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const currentRole = (req: ApprovalRequest) =>
    req.steps.find((s) => s.order === req.currentStepOrder)?.requiredRole;

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-[26px] font-bold tracking-tight text-frost">Pending Approvals</h1>
        <p className="mt-1 text-sm text-frost-dim">Requests awaiting your decision.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <Card className="py-14 text-center">
          <IconInbox size={36} stroke={1.2} className="mx-auto mb-3 text-dim" />
          <p className="text-frost-dim">Your inbox is empty.</p>
          <p className="mt-1 text-sm text-dim">Nothing is waiting for your approval right now.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((req) => {
            const role = currentRole(req);
            return (
              <Card key={req.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <Pill tone="brand"><IconTag size={13} /> {actionLabel(req.actionKey)}</Pill>
                      {role && <span className="text-xs text-dim">waiting on <b className="text-frost-dim">{ROLE_LABELS[role] ?? role}</b></span>}
                    </div>
                    <div className="text-lg font-bold text-frost">{req.title}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dim">
                      <span className="flex items-center gap-1.5"><IconUser size={13} /> {req.requesterEmail}</span>
                      <span className="flex items-center gap-1.5"><IconClock size={13} /> {fmtDate(req.createdAt)}</span>
                      <span>Rule: {req.ruleNameSnapshot}</span>
                    </div>
                    <div className="mt-3"><StepChain steps={req.steps} /></div>
                  </div>
                  {req.canAct && (
                    <div className="flex gap-2">
                      <Button variant="danger" onClick={() => setActing({ request: req, mode: 'reject' })}>Reject</Button>
                      <Button onClick={() => setActing({ request: req, mode: 'approve' })}>Approve</Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {acting && (
        <ActionModal
          request={acting.request}
          mode={acting.mode}
          onClose={() => setActing(null)}
          onDone={() => { setActing(null); void load(); }}
        />
      )}
    </AppShell>
  );
}

function ActionModal({ request, mode, onClose, onDone }: {
  request: ApprovalRequest; mode: 'approve' | 'reject'; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const isApprove = mode === 'approve';
  const role = request.steps.find((s) => s.order === request.currentStepOrder)?.requiredRole;

  const submit = async () => {
    setLoading(true);
    try {
      const res = isApprove
        ? await approvalsApi.approve(request.id, note || undefined)
        : await approvalsApi.reject(request.id, note || undefined);
      const status = res.data.data?.status;
      if (status === 'ApprovedButFailed') {
        toast.error(`Approved, but the action failed: ${res.data.data?.outcome ?? 'unknown error'}`);
        onDone();
        return;
      }
      toast.success(res.data.message ?? (isApprove ? 'Approved.' : 'Rejected.'));
      onDone();
    } catch (err) {
      toast.error(apiError(err, 'Action failed.'));
      setLoading(false);
    }
  };

  return (
    <Modal open title={`${isApprove ? 'Approve' : 'Reject'} request`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* Full details of what's being decided */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-center gap-2">
            <Pill tone="brand">{ACTION_LABELS[request.actionKey] ?? request.actionKey}</Pill>
          </div>
          <div className="font-bold text-frost">{request.title}</div>
          <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
            <dt className="text-dim">Requested by</dt><dd className="text-frost-dim">{request.requesterEmail}</dd>
            <dt className="text-dim">Submitted</dt><dd className="text-frost-dim">{fmtDate(request.createdAt)}</dd>
            <dt className="text-dim">Rule</dt><dd className="text-frost-dim">{request.ruleNameSnapshot}</dd>
            {role && (<><dt className="text-dim">Your step</dt><dd className="text-frost-dim">{ROLE_LABELS[role] ?? role}</dd></>)}
          </dl>
          <div className="mt-3 border-t border-border pt-3"><StepChain steps={request.steps} /></div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-frost-dim">
            {isApprove ? 'Comment (optional)' : 'Reason (optional)'}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-frost placeholder:text-dim focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
            placeholder={isApprove ? 'Looks good…' : 'Why is this being rejected?'}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={isApprove ? 'primary' : 'danger'} loading={loading} onClick={() => void submit()}>
            {isApprove ? 'Approve & Execute' : 'Reject'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
