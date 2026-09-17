import { useCallback, useEffect, useState } from 'react';
import { IconCalendarStats, IconPlus, IconWand } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { hrApi, type LeaveType } from '../../api/hr.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, Field, Modal, Spinner } from '../../components/ui';
import { roleLevel } from '../../utils/roles';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

export default function LeaveTypesPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const canManage = user ? roleLevel(user.role) <= 2 : false;
  const [items, setItems] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try { setItems((await hrApi.listLeaveTypes()).data.data ?? []); }
    catch (e) { setError(err(e, 'Failed to load leave types.')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const seed = async () => {
    try { await hrApi.seedLeaveTypes(activeCompanyId); void load(); }
    catch (e) { setError(err(e, 'Failed to seed.')); }
  };

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-frost">Leave Types</h1>
          <p className="mt-1 text-sm text-frost-dim">Leave categories and annual allocations.</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => void seed()}><IconWand size={18} stroke={1.5} /> Seed defaults</Button>
            <Button onClick={() => setOpen(true)}><IconPlus size={18} stroke={1.5} /> New</Button>
          </div>
        )}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <Card className="py-14 text-center">
          <IconCalendarStats size={36} stroke={1.2} className="mx-auto mb-3 text-dim" />
          <p className="text-frost-dim">No leave types yet.</p>
          {canManage && <p className="mt-1 text-sm text-dim">Click "Seed defaults" to add the standard five.</p>}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((t) => (
            <Card key={t.id} className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-frost">{t.name}</span>
                  <span className="rounded bg-surface px-1.5 py-0.5 text-xs text-frost-dim">{t.code}</span>
                  {!t.isPaid && <span className="rounded bg-warning/15 px-1.5 py-0.5 text-xs text-warning">Unpaid</span>}
                </div>
                <div className="mt-1 text-sm text-dim">{t.defaultDays > 0 ? `${t.defaultDays} days/year` : 'Unlimited'}</div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {open && <CreateModal companyId={activeCompanyId} onClose={() => setOpen(false)} onDone={() => { setOpen(false); void load(); }} />}
    </AppShell>
  );
}

function CreateModal({ companyId, onClose, onDone }: { companyId?: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [defaultDays, setDefaultDays] = useState('20');
  const [isPaid, setIsPaid] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !code.trim()) return setError('Name and code are required.');
    setLoading(true);
    try {
      await hrApi.createLeaveType({ companyId, name, code, defaultDays: Number(defaultDays || 0), isPaid });
      onDone();
    } catch (e) { setError(err(e, 'Failed to create.')); setLoading(false); }
  };

  return (
    <Modal open title="New Leave Type" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Name" placeholder="Annual Leave" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code" placeholder="AL" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <Field label="Default days/year" type="number" value={defaultDays} onChange={(e) => setDefaultDays(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-frost-dim">
          <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)}
            className="h-4 w-4 accent-primary" />
          Paid leave
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}
