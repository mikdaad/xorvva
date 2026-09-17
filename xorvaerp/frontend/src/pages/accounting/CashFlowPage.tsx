import { useCallback, useEffect, useState } from 'react';
import { IconArrowsExchange } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type CashFlow } from '../../api/accounting.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Card, Field, Spinner } from '../../components/ui';

const money = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function CashFlowPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<CashFlow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await accountingApi.getCashFlow(companyId, from, to); setData(r.data.data ?? null); }
    catch (e) { const ax = e as AxiosError<ApiResponse<never>>; toast.error(ax.response?.data?.message ?? 'Failed to load cash flow.'); }
    finally { setLoading(false); }
  }, [companyId, from, to, toast]);
  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-frost">Cash Flow</h1>
          <p className="mt-1 text-sm text-frost-dim">Money in and out of your bank &amp; cash accounts over a period.</p>
        </div>
        <div className="flex items-end gap-3">
          <Field label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Field label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : !data ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconArrowsExchange size={38} stroke={1.2} className="text-primary" /><p className="text-frost-dim">No data.</p>
        </Card>
      ) : (
        <Card className="mx-auto max-w-lg overflow-hidden p-0">
          <div className="flex justify-between px-5 py-3 text-sm">
            <span className="text-frost-dim">Opening cash</span>
            <span className="font-mono tabular-nums text-frost-dim">{money(data.openingCash)}</span>
          </div>

          <div className="border-t border-border px-5 py-2 text-xs font-semibold uppercase text-dim">Activity</div>
          {data.activities.length === 0 ? (
            <div className="px-5 py-3 text-sm text-dim">No cash movement in this period.</div>
          ) : data.activities.map((a) => (
            <div key={a.category} className="flex justify-between px-5 py-2 text-sm">
              <span className="text-frost-dim">{a.category}</span>
              <span className={`font-mono tabular-nums ${a.amount >= 0 ? 'text-success' : 'text-danger'}`}>
                {a.amount >= 0 ? '+' : '−'}{money(Math.abs(a.amount))}
              </span>
            </div>
          ))}

          <div className="flex justify-between border-t border-border px-5 py-2.5 text-sm font-semibold text-frost">
            <span>Net change</span>
            <span className={`font-mono tabular-nums ${data.netChange >= 0 ? 'text-success' : 'text-danger'}`}>{money(data.netChange)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-border px-5 py-3 text-base font-bold text-frost">
            <span>Closing cash</span>
            <span className="font-mono tabular-nums">{money(data.closingCash)}</span>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
