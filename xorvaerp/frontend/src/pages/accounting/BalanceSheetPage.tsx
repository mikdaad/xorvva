import { useCallback, useEffect, useState } from 'react';
import { IconScale } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type BalanceSheet, type StatementRow } from '../../api/accounting.api';
import type { ApiResponse } from '../../api/auth.api';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Card, Field, Spinner } from '../../components/ui';
import { Pill } from '../../components/dashboard-ui';
import { useReportScope } from '../../components/accounting/useReportScope';
import { ExportButtons } from '../../components/accounting/ExportButtons';

const money = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function BalanceSheetPage() {
  const toast = useToast();
  const { companyId, scopeControl } = useReportScope();

  const [asOf, setAsOf] = useState(todayStr());
  const [data, setData] = useState<BalanceSheet | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await accountingApi.getBalanceSheet(companyId, asOf); setData(r.data.data ?? null); }
    catch (e) { const ax = e as AxiosError<ApiResponse<never>>; toast.error(ax.response?.data?.message ?? 'Failed to load balance sheet.'); }
    finally { setLoading(false); }
  }, [companyId, asOf, toast]);
  useEffect(() => { void load(); }, [load]);

  const Rows = ({ rows }: { rows: StatementRow[] }) => (
    <>{rows.length === 0 ? <div className="px-4 py-2 text-sm text-dim">None</div> : rows.map((r) => (
      <div key={r.code} className="flex justify-between px-4 py-2 text-sm">
        <span className="text-frost-dim"><span className="mr-2 font-mono text-xs text-dim">{r.code}</span>{r.name}</span>
        <span className="font-mono tabular-nums text-frost-dim">{money(r.amount)}</span>
      </div>
    ))}</>
  );

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[26px] font-semibold tracking-tight text-frost">Balance Sheet</h1>
          <p className="mt-1 text-sm text-frost-dim">What the company owns vs. owes, as at a date.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {scopeControl}
          {data && (data.isBalanced ? <Pill tone="ok">Balanced</Pill> : <Pill tone="bad">Out of balance</Pill>)}
          <Field label="As at" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          <ExportButtons reportType="BalanceSheet" companyId={companyId} asOf={asOf} disabled={!data} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : !data ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconScale size={38} stroke={1.2} className="text-primary" /><p className="text-frost-dim">No data.</p>
        </Card>
      ) : (
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-border px-4 py-2 label-mono text-dim">Assets</div>
            <Rows rows={data.assets} />
            <div className="flex justify-between border-t-2 border-border px-4 py-3 font-bold text-frost">
              <span>Total Assets</span><span className="font-mono tabular-nums">{money(data.totalAssets)}</span>
            </div>
          </Card>

          <div className="flex flex-col gap-6">
            <Card className="overflow-hidden p-0">
              <div className="border-b border-border px-4 py-2 label-mono text-dim">Liabilities</div>
              <Rows rows={data.liabilities} />
              <div className="flex justify-between border-t border-border px-4 py-2 font-semibold text-frost">
                <span>Total Liabilities</span><span className="font-mono tabular-nums">{money(data.totalLiabilities)}</span>
              </div>
            </Card>
            <Card className="overflow-hidden p-0">
              <div className="border-b border-border px-4 py-2 label-mono text-dim">Equity</div>
              <Rows rows={data.equity} />
              <div className="flex justify-between px-4 py-2 text-sm">
                <span className="text-frost-dim">Current Year Earnings</span>
                <span className="font-mono tabular-nums text-frost-dim">{money(data.currentYearEarnings)}</span>
              </div>
              <div className="flex justify-between border-t border-border px-4 py-2 font-semibold text-frost">
                <span>Total Equity</span><span className="font-mono tabular-nums">{money(data.totalEquity)}</span>
              </div>
            </Card>
            <div className="flex justify-between rounded-xl bg-surface px-4 py-3 font-bold text-frost">
              <span>Liabilities + Equity</span>
              <span className="font-mono tabular-nums">{money(data.totalLiabilities + data.totalEquity)}</span>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
