import { useCallback, useEffect, useState } from 'react';
import { IconCalendarEvent, IconPlus, IconTrash } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { hrApi, type Holiday } from '../../api/hr.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, Field, Modal, Spinner } from '../../components/ui';
import { PageHeader } from '../../components/dashboard-ui';
import { roleLevel } from '../../utils/roles';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

export default function HolidaysPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const canManage = user ? roleLevel(user.role) <= 2 : false;
  const [items, setItems] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try { setItems((await hrApi.listHolidays()).data.data ?? []); }
    catch (e) { setError(err(e, 'Failed to load holidays.')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const remove = async (id: string) => {
    try { await hrApi.deleteHoliday(id); void load(); }
    catch (e) { setError(err(e, 'Failed to delete.')); }
  };

  return (
    <AppShell>
      <PageHeader
        title="Holidays"
        subtitle="Public holidays — excluded from leave-day calculations."
        action={canManage && <Button onClick={() => setOpen(true)}><IconPlus size={18} stroke={1.5} /> Add Holiday</Button>}
      />
      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <Card className="py-14 text-center">
          <IconCalendarEvent size={36} stroke={1.2} className="mx-auto mb-3 text-dim" />
          <p className="text-frost-dim">No holidays configured.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((h) => (
            <Card key={h.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-weak text-glow">
                  <IconCalendarEvent size={18} stroke={1.6} />
                </span>
                <div>
                  <div className="font-medium text-frost">{h.name}</div>
                  <div className="text-xs text-dim">{new Date(h.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>
              </div>
              {canManage && <Button variant="ghost" onClick={() => remove(h.id)}><IconTrash size={18} stroke={1.5} /></Button>}
            </Card>
          ))}
        </div>
      )}

      {open && <AddModal companyId={activeCompanyId} onClose={() => setOpen(false)} onDone={() => { setOpen(false); void load(); }} />}
    </AppShell>
  );
}

function AddModal({ companyId, onClose, onDone }: { companyId?: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !date) return setError('Name and date are required.');
    setLoading(true);
    try { await hrApi.createHoliday({ companyId, name, date }); onDone(); }
    catch (e) { setError(err(e, 'Failed to add.')); setLoading(false); }
  };

  return (
    <Modal open title="Add Holiday" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Name" placeholder="National Day" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Add</Button>
        </div>
      </div>
    </Modal>
  );
}
