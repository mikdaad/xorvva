import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconPlus, IconBuildingBank } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type Account, type BankAccount } from '../../api/accounting.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Field, Modal, SelectField, Spinner } from '../../components/ui';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};

export default function BankAccountsPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [rows, setRows] = useState<BankAccount[]>([]);
  const [ledger, setLedger] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, a] = await Promise.all([
        accountingApi.listBankAccounts(companyId),
        accountingApi.listAccounts(companyId, false),
      ]);
      setRows(b.data.data ?? []);
      setLedger((a.data.data ?? []).filter((x) => x.accountSubType === 'Bank' || x.accountSubType === 'Cash'));
    } catch (e) { toast.error(err(e, 'Failed to load bank accounts.')); }
    finally { setLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-frost">Bank Accounts</h1>
          <p className="mt-1 text-sm text-frost-dim">Where money is received and paid — each links to a ledger account.</p>
        </div>
        <Button disabled={ledger.length === 0} onClick={() => setCreateOpen(true)}><IconPlus size={18} stroke={1.6} /> New bank account</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconBuildingBank size={38} stroke={1.2} className="text-primary" />
          <p className="text-frost-dim">
            {ledger.length === 0 ? 'Seed the chart of accounts first — it creates the Bank and Cash ledger accounts.' : 'No bank accounts yet.'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-dim">
                <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Bank</th><th className="px-4 py-3">Account #</th><th className="px-4 py-3">IBAN</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((b) => (
                  <tr key={b.id} className="hover:bg-hover">
                    <td className="px-4 py-2.5 text-frost">{b.name}</td>
                    <td className="px-4 py-2.5 text-frost-dim">{b.bankName ?? '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-dim">{b.accountNumber ?? '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-dim">{b.iban ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {createOpen && <CreateBankModal companyId={companyId} ledger={ledger} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); void load(); }} />}
    </AppShell>
  );
}

function CreateBankModal({ companyId, ledger, onClose, onDone }: {
  companyId?: string; ledger: Account[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', accountId: ledger[0]?.id ?? '', bankName: '', accountNumber: '', iban: '' });
  const [loading, setLoading] = useState(false);
  const options = useMemo(() => ledger.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })), [ledger]);

  const submit = async () => {
    if (!f.name.trim() || !f.accountId) return toast.error('Name and ledger account are required.');
    setLoading(true);
    try { await accountingApi.createBankAccount({ companyId, ...f }); toast.success('Bank account created.'); onDone(); }
    catch (e) { toast.error(err(e, 'Failed to create bank account.')); setLoading(false); }
  };

  return (
    <Modal open title="New bank account" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Name" value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. Emirates NBD — Current" />
        <SelectField label="Ledger account" options={options} value={f.accountId} onChange={(e) => setF((s) => ({ ...s, accountId: e.target.value }))} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bank name" value={f.bankName} onChange={(e) => setF((s) => ({ ...s, bankName: e.target.value }))} />
          <Field label="Account number" value={f.accountNumber} onChange={(e) => setF((s) => ({ ...s, accountNumber: e.target.value }))} />
        </div>
        <Field label="IBAN" value={f.iban} onChange={(e) => setF((s) => ({ ...s, iban: e.target.value }))} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}
