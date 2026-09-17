import { useCallback, useEffect, useState } from 'react';
import { IconChecklist } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type BankAccount, type BankReconciliation } from '../../api/accounting.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Card, Field, SelectField, Spinner } from '../../components/ui';
import { Pill } from '../../components/dashboard-ui';

const money = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BankReconciliationPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [bankId, setBankId] = useState('');
  const [data, setData] = useState<BankReconciliation | null>(null);
  const [statement, setStatement] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyLine, setBusyLine] = useState<string | null>(null);

  useEffect(() => {
    accountingApi.listBankAccounts(companyId)
      .then((r) => { const list = r.data.data ?? []; setBanks(list); if (list.length && !bankId) setBankId(list[0].id); })
      .catch(() => {}).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const load = useCallback(async () => {
    if (!bankId) { setData(null); return; }
    try { const r = await accountingApi.getBankReconciliation(bankId, companyId); setData(r.data.data ?? null); }
    catch (e) { const ax = e as AxiosError<ApiResponse<never>>; toast.error(ax.response?.data?.message ?? 'Failed to load reconciliation.'); }
  }, [bankId, companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (lineId: string, isReconciled: boolean) => {
    setBusyLine(lineId);
    try { await accountingApi.setLineReconciled(lineId, isReconciled, companyId); await load(); }
    catch (e) { const ax = e as AxiosError<ApiResponse<never>>; toast.error(ax.response?.data?.message ?? 'Failed to update line.'); }
    finally { setBusyLine(null); }
  };

  const stmt = parseFloat(statement);
  const diff = data && !Number.isNaN(stmt) ? Math.round((stmt - data.reconciledBalance) * 100) / 100 : null;

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-frost">Bank Reconciliation</h1>
          <p className="mt-1 text-sm text-frost-dim">Tick the ledger movements that appear on your bank statement.</p>
        </div>
        <div className="min-w-64">
          <SelectField label="Bank account" options={banks.map((b) => ({ value: b.id, label: b.name }))}
            value={bankId} onChange={(e) => setBankId(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : !data ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconChecklist size={38} stroke={1.2} className="text-primary" />
          <p className="text-frost-dim">{banks.length === 0 ? 'Add a bank account first.' : 'Select a bank account to reconcile.'}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-wider text-dim">Ledger balance</div><div className="mt-1 text-xl font-extrabold tabular-nums text-frost">{money(data.ledgerBalance)}</div></Card>
            <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-wider text-dim">Reconciled</div><div className="mt-1 text-xl font-extrabold tabular-nums text-success">{money(data.reconciledBalance)}</div></Card>
            <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-wider text-dim">Unreconciled</div><div className="mt-1 text-xl font-extrabold tabular-nums text-warning">{money(data.unreconciledBalance)}</div></Card>
            <Card className="p-4">
              <Field label="Statement balance" type="number" value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="0.00" />
              {diff !== null && <div className={`mt-1 text-xs font-semibold ${diff === 0 ? 'text-success' : 'text-danger'}`}>{diff === 0 ? 'Matches reconciled ✓' : `Off by ${money(Math.abs(diff))}`}</div>}
            </Card>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-dim">
                  <tr>
                    <th className="px-4 py-3 w-10"></th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Entry</th>
                    <th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right">Debit</th><th className="px-4 py-3 text-right">Credit</th><th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.lines.map((l) => (
                    <tr key={l.id} className="hover:bg-hover">
                      <td className="px-4 py-2.5">
                        <input type="checkbox" className="accent-primary" checked={l.isReconciled}
                          disabled={busyLine === l.id} onChange={(e) => void toggle(l.id, e.target.checked)} />
                      </td>
                      <td className="px-4 py-2.5 text-frost-dim">{new Date(l.date).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-frost">{l.entryNumber}</td>
                      <td className="px-4 py-2.5 text-frost-dim">{l.description}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{l.debit ? money(l.debit) : ''}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{l.credit ? money(l.credit) : ''}</td>
                      <td className="px-4 py-2.5">{l.isReconciled ? <Pill tone="ok">Cleared</Pill> : <Pill tone="neutral">Open</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
