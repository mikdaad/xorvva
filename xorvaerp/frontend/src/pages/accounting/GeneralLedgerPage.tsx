import { useCallback, useEffect, useState } from 'react';
import { IconBook } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type Account, type GeneralLedger } from '../../api/accounting.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Card, Field, SelectField, Spinner } from '../../components/ui';

const money = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function GeneralLedgerPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(todayStr());
  const [gl, setGl] = useState<GeneralLedger | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    accountingApi.listAccounts(companyId, false)
      .then((r) => {
        const list = r.data.data ?? [];
        setAccounts(list);
        if (list.length && !accountId) setAccountId(list[0].id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try { const r = await accountingApi.getGeneralLedger(accountId, companyId, from, to); setGl(r.data.data ?? null); }
    catch (e) { const ax = e as AxiosError<ApiResponse<never>>; toast.error(ax.response?.data?.message ?? 'Failed to load ledger.'); }
    finally { setLoading(false); }
  }, [accountId, companyId, from, to, toast]);
  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-frost">General Ledger</h1>
        <p className="mt-1 text-sm text-frost-dim">Every movement on an account, with a running balance.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-64">
          <SelectField label="Account" options={accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))}
            value={accountId} onChange={(e) => setAccountId(e.target.value)} />
        </div>
        <Field label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Field label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : !gl ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconBook size={38} stroke={1.2} className="text-primary" />
          <p className="text-frost-dim">Pick an account to see its ledger.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-dim">
                <tr>
                  <th className="px-4 py-3">Date</th><th className="px-4 py-3">Entry</th><th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Debit</th><th className="px-4 py-3 text-right">Credit</th><th className="px-4 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="bg-surface/50">
                  <td className="px-4 py-2 text-xs italic text-dim" colSpan={5}>Opening balance</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-frost-dim">{money(gl.opening)}</td>
                </tr>
                {gl.lines.map((l, idx) => (
                  <tr key={idx} className="hover:bg-hover">
                    <td className="px-4 py-2.5 text-frost-dim">{new Date(l.date).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-frost">{l.entryNumber}</td>
                    <td className="px-4 py-2.5 text-frost-dim">{l.description}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{l.debit ? money(l.debit) : ''}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{l.credit ? money(l.credit) : ''}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost">{money(l.running)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border font-semibold text-frost">
                <tr><td className="px-4 py-3" colSpan={5}>Closing balance</td><td className="px-4 py-3 text-right font-mono tabular-nums">{money(gl.closing)}</td></tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
