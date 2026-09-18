import { useCallback, useEffect, useState } from 'react';
import { IconTrendingUp } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type ProfitAndLoss, type StatementRow } from '../../api/accounting.api';
import type { ApiResponse } from '../../api/auth.api';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Card, Field, Spinner } from '../../components/ui';
import { useReportScope } from '../../components/accounting/useReportScope';

const money = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function ProfitAndLossPage() {
  const toast = useToast();
  const { companyId, scopeControl } = useReportScope();

  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<ProfitAndLoss | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await accountingApi.getProfitAndLoss(companyId, from, to); setData(r.data.data ?? null); }
    catch (e) { const ax = e as AxiosError<ApiResponse<never>>; toast.error(ax.response?.data?.message ?? 'Failed to load P&L.'); }
    finally { setLoading(false); }
  }, [companyId, from, to, toast]);
  useEffect(() => { void load(); }, [load]);

  const Section = ({ title, rows, total }: { title: string; rows: StatementRow[]; total: number }) => (
    <div>
      <div className="border-b border-border px-4 py-2 label-mono text-dim">{title}</div>
      {rows.length === 0 ? <div className="px-4 py-3 text-sm text-dim">No activity</div> : rows.map((r) => (
        <div key={r.code} className="flex justify-between px-4 py-2 text-sm">
          <span className="text-frost-dim"><span className="mr-2 font-mono text-xs text-dim">{r.code}</span>{r.name}</span>
          <span className="font-mono tabular-nums text-frost-dim">{money(r.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-border px-4 py-2 text-sm font-semibold text-frost">
        <span>Total {title}</span><span className="font-mono tabular-nums">{money(total)}</span>
      </div>
    </div>
  );

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[26px] font-semibold tracking-tight text-frost">Profit &amp; Loss</h1>
          <p className="mt-1 text-sm text-frost-dim">Revenue minus expenses over a period.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {scopeControl}
          <Field label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Field label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : !data ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconTrendingUp size={38} stroke={1.2} className="text-primary" />
          <p className="text-frost-dim">No data.</p>
        </Card>
      ) : (
        <Card className="mx-auto max-w-2xl overflow-hidden p-0">
          <Section title="Revenue" rows={data.revenue} total={data.totalRevenue} />
          <Section title="Expenses" rows={data.expenses} total={data.totalExpenses} />
          <div className={`flex justify-between px-4 py-3 text-base font-bold ${data.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>
            <span>Net {data.netProfit >= 0 ? 'Profit' : 'Loss'}</span>
            <span className="font-mono tabular-nums">{money(data.netProfit)}</span>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
