import { useCallback, useEffect, useState } from 'react';
import { IconClockDollar } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type AgedReceivables } from '../../api/accounting.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Card, Spinner } from '../../components/ui';

const money = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AgedReceivablesPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [data, setData] = useState<AgedReceivables | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await accountingApi.getAgedReceivables(companyId); setData(r.data.data ?? null); }
    catch (e) { const ax = e as AxiosError<ApiResponse<never>>; toast.error(ax.response?.data?.message ?? 'Failed to load aged receivables.'); }
    finally { setLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  const cols = ['Current', '1–30', '31–60', '61–90', '90+'];

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-frost">Aged Receivables</h1>
        <p className="mt-1 text-sm text-frost-dim">Who owes you, and how overdue — bucketed by days past due.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : !data || data.rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconClockDollar size={38} stroke={1.2} className="text-primary" />
          <p className="text-frost-dim">No outstanding customer balances.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-dim">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  {cols.map((c) => <th key={c} className="px-4 py-3 text-right">{c}</th>)}
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rows.map((r) => (
                  <tr key={r.contactId} className="hover:bg-hover">
                    <td className="px-4 py-2.5 text-frost">{r.contactName}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{money(r.current)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{money(r.days1To30)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{money(r.days31To60)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{money(r.days61To90)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-warning">{money(r.days90Plus)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-frost">{money(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border font-semibold text-frost">
                <tr>
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{money(data.totals.current)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{money(data.totals.days1To30)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{money(data.totals.days31To60)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{money(data.totals.days61To90)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{money(data.totals.days90Plus)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{money(data.totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
