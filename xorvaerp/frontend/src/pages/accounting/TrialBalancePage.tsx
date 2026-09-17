import { useCallback, useEffect, useState } from 'react';
import { IconScale } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type TrialBalance } from '../../api/accounting.api';
import type { ApiResponse } from '../../api/auth.api';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Card, Spinner } from '../../components/ui';
import { Pill } from '../../components/dashboard-ui';
import { useReportScope } from '../../components/accounting/useReportScope';

const money = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TrialBalancePage() {
  const toast = useToast();
  const { companyId, scopeControl } = useReportScope();

  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await accountingApi.getTrialBalance(companyId);
      setTb(r.data.data ?? null);
    } catch (e) {
      const ax = e as AxiosError<ApiResponse<never>>;
      toast.error(ax.response?.data?.message ?? 'Failed to load the trial balance.');
    } finally { setLoading(false); }
  }, [companyId, toast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-frost">Trial Balance</h1>
          <p className="mt-1 text-sm text-frost-dim">Every account's balance, straight from the posted ledger. Debits must equal credits.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {scopeControl}
          {tb && (
            tb.isBalanced
              ? <Pill tone="ok">Balanced</Pill>
              : <Pill tone="bad">Out of balance</Pill>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : !tb || tb.rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconScale size={40} stroke={1.3} className="text-primary" />
          <p className="text-frost-dim">No ledger activity yet. Post a journal or an invoice to see balances here.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-dim">
                <tr>
                  <th className="px-4 py-3 w-24">Code</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tb.rows.map((r) => (
                  <tr key={r.code} className="hover:bg-hover">
                    <td className="px-4 py-2.5 font-mono text-xs text-frost-dim">{r.code}</td>
                    <td className="px-4 py-2.5 text-frost">{r.name}</td>
                    <td className="px-4 py-2.5 text-frost-dim">{r.accountType}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{r.debit ? money(r.debit) : ''}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{r.credit ? money(r.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border font-semibold text-frost">
                <tr>
                  <td className="px-4 py-3" colSpan={3}>Total</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{money(tb.totalDebit)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{money(tb.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
