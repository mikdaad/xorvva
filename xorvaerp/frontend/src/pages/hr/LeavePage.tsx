import { useCallback, useEffect, useState } from 'react';
import { IconCalendarPlus, IconUserExclamation } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { hrApi, STATUS_BADGE, type LeaveBalance, type LeaveRequest, type LeaveType } from '../../api/hr.api';
import { approvalsApi, STATUS_STYLES, type ApprovalRequest } from '../../api/approvals.api';
import type { ApiResponse } from '../../api/auth.api';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, Field, Modal, SelectField, Spinner } from '../../components/ui';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

export default function LeavePage() {
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [inFlight, setInFlight] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      await hrApi.myProfile(); // 404s when the account has no linked employee record
      setLinked(true);
      const [bal, mine, reqs] = await Promise.all([
        hrApi.leaveBalance(), hrApi.myLeaves(), approvalsApi.myRequests('HR.LeaveRequest'),
      ]);
      setBalances(bal.data.data ?? []);
      setLeaves(mine.data.data ?? []);
      // Only Pending/Rejected have no LeaveRequest row yet — approved ones already appear
      // in `leaves`, so showing them here too would duplicate.
      setInFlight((reqs.data.data ?? []).filter((r) => r.status === 'Pending' || r.status === 'Rejected'));
    } catch {
      // No linked employee → show friendly guidance instead of a doomed "Apply" flow.
      setLinked(false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const cancel = async (id: string) => {
    try { await hrApi.cancelLeave(id); void load(); }
    catch (e) { setError(err(e, 'Failed to cancel.')); }
  };

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-frost">My Leave</h1>
          <p className="mt-1 text-sm text-frost-dim">Balances and requests for this year.</p>
        </div>
        <Button onClick={() => setApplyOpen(true)} disabled={!linked}>
          <IconCalendarPlus size={18} stroke={1.5} /> Apply for Leave
        </Button>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : !linked ? (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--c-warn-weak)] text-warning">
            <IconUserExclamation size={28} stroke={1.6} />
          </span>
          <div className="text-lg font-bold text-frost">No employee profile yet</div>
          <p className="max-w-md text-sm text-frost-dim">
            Leave is for employees. Your login isn't linked to an employee record, so there's nothing
            to request against. Ask an admin to add you under <b>HR → Employees → New Employee</b> —
            they can grant you access at the same time, and your leave will work here.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {balances.map((b) => (
              <Card key={b.leaveTypeId}>
                <div className="text-xs font-medium uppercase tracking-wide text-dim">{b.leaveTypeName}</div>
                <div className="mt-2 text-2xl font-bold text-frost">
                  {b.remainingDays}<span className="text-sm font-normal text-dim"> / {b.totalDays}</span>
                </div>
                <div className="mt-1 text-xs text-frost-dim">{b.usedDays} used</div>
              </Card>
            ))}
          </div>

          <h2 className="mb-3 text-lg font-semibold text-frost">My Requests</h2>
          {leaves.length === 0 && inFlight.length === 0 ? (
            <Card className="py-10 text-center text-frost-dim">No leave requests yet.</Card>
          ) : (
            <div className="flex flex-col gap-3">
              {/* In-flight (awaiting or rejected) — these have no leave record yet */}
              {inFlight.map((r) => (
                <RequestRow key={r.id} req={r} />
              ))}
              {leaves.map((l) => (
                <Card key={l.id} className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-frost">{l.leaveTypeName}</span>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[l.status] ?? ''}`}>{l.status}</span>
                    </div>
                    <div className="mt-1 text-sm text-frost-dim">
                      {l.fromDate} → {l.toDate} · {l.totalDays} day(s) · {l.reason}
                    </div>
                  </div>
                  {(l.status === 'Approved' || l.status === 'Pending') && (
                    <Button variant="ghost" onClick={() => void cancel(l.id)}>Cancel</Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {applyOpen && (
        <ApplyModal
          onClose={() => setApplyOpen(false)}
          onDone={() => { setApplyOpen(false); void load(); }}
          onApplied={() => void load()}
        />
      )}
    </AppShell>
  );
}

/** A leave request still in the approval engine (no LeaveRequest row yet). */
function RequestRow({ req }: { req: ApprovalRequest }) {
  const nextRole = req.steps.find((s) => s.order === req.currentStepOrder)?.requiredRole;
  const dates = req.title.replace(/^Leave\s*/i, '');
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-frost">Leave request</span>
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[req.status]}`}>{req.status}</span>
        </div>
        <div className="mt-1 text-sm text-frost-dim">
          {dates}
          {req.status === 'Pending' && nextRole ? ` · awaiting ${nextRole} approval` : ''}
          {req.status === 'Rejected' ? ' · not approved' : ''}
        </div>
      </div>
    </Card>
  );
}

function ApplyModal({ onClose, onDone, onApplied }: { onClose: () => void; onDone: () => void; onApplied: () => void }) {
  const toast = useToast();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    hrApi.listLeaveTypes().then((r) => {
      const list = r.data.data ?? [];
      setTypes(list);
      setLeaveTypeId(list[0]?.id ?? '');
    });
  }, []);

  const submit = async () => {
    if (!leaveTypeId) return toast.error('Select a leave type.');
    if (!fromDate || !toDate) return toast.error('Select the dates.');
    if (!reason.trim()) return toast.error('A reason is required.');
    setLoading(true);
    try {
      const res = await hrApi.applyLeave({ leaveTypeId, fromDate, toDate, reason });
      if (res.data.pendingApproval) {
        toast.success('Leave submitted for approval — you\'ll see it under “My Requests” as Pending.');
        onApplied();
      } else {
        toast.success('Leave recorded.');
      }
      onDone();
    } catch (e) { toast.error(err(e, 'Failed to apply for leave.')); setLoading(false); }
  };

  return (
    <Modal open title="Apply for Leave" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <SelectField label="Leave type" options={types.map((t) => ({ value: t.id, label: t.name }))}
          value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="From" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <Field label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <Field label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button loading={loading} onClick={() => void submit()}>Submit</Button>
        </div>
      </div>
    </Modal>
  );
}
