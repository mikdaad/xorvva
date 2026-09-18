import { useCallback, useEffect, useState } from 'react';
import { IconCash, IconFileInvoice, IconTrendingUp, IconAlertTriangle, IconReportMoney, IconKeyboard, IconListDetails, IconFileImport, IconSparkles, IconSitemap } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { AxiosError } from 'axios';
import { accountingApi, type FinanceDashboard } from '../../api/accounting.api';
import type { ApiResponse } from '../../api/auth.api';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Card, Spinner } from '../../components/ui';
import { StatTile, SectionCard, Sparkline } from '../../components/dashboard-ui';
import { useReportScope } from '../../components/accounting/useReportScope';

const money = (n: number) => `AED ${n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = (ym: string) => new Date(`${ym}-01`).toLocaleDateString('en-AE', { month: 'short' });

const QUICK = [
  { to: '/accounting/vouchers/new', label: 'Voucher entry', hint: 'F4–F9 Tally-style screen', icon: IconKeyboard },
  { to: '/accounting/vouchers', label: 'Voucher register', hint: 'All vouchers, export PDF/XLSX', icon: IconListDetails },
  { to: '/accounting/bank-statements', label: 'Bank statements', hint: 'Import CSV & match', icon: IconFileImport },
  { to: '/accounting/inbox', label: 'Document inbox', hint: 'AI-extract supplier invoices', icon: IconSparkles },
  { to: '/accounting/cost-centres', label: 'Cost centres', hint: 'Departments, projects, budgets', icon: IconSitemap },
];

export default function AccountingHomePage() {
  const toast = useToast();
  const { companyId, scopeControl } = useReportScope();

  const [d, setD] = useState<FinanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await accountingApi.getDashboard(companyId); setD(r.data.data ?? null); }
    catch (e) { const ax = e as AxiosError<ApiResponse<never>>; toast.error(ax.response?.data?.message ?? 'Failed to load dashboard.'); }
    finally { setLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  const empty = d && d.cashPosition === 0 && d.accountsReceivable === 0 && d.revenueYtd === 0 && d.openInvoicesCount === 0;

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-frost">Accounting</h1>
          <p className="mt-1 text-sm text-frost-dim">Your company's finances at a glance.</p>
        </div>
        {scopeControl}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {QUICK.map((q) => (
          <Link key={q.to} to={q.to} className="group flex items-center gap-3 rounded-xl border border-border bg-abyss px-4 py-3 shadow-soft-sm transition-colors hover:border-border-strong hover:bg-hover">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-weak text-glow"><q.icon size={18} stroke={1.7} /></span>
            <span className="min-w-0"><span className="block text-sm font-semibold text-frost">{q.label}</span><span className="block truncate text-xs text-dim">{q.hint}</span></span>
          </Link>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : !d ? (
        <Card className="py-16 text-center"><p className="text-frost-dim">No data.</p></Card>
      ) : empty ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconReportMoney size={40} stroke={1.3} className="text-primary" />
          <p className="text-frost">Let's set up your books.</p>
          <p className="max-w-md text-sm text-frost-dim">
            Go to <b className="text-frost">Chart of Accounts</b> to pick an industry template, add tax rates and a bank account,
            then raise your first invoice — figures will appear here automatically.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Cash position" value={money(d.cashPosition)} icon={<IconCash size={17} stroke={1.7} />} tone="primary" />
            <StatTile label="Receivables" value={money(d.accountsReceivable)} hint={`${d.openInvoicesCount} open invoices`} icon={<IconFileInvoice size={17} stroke={1.7} />} tone="default" />
            <StatTile label="Net profit (YTD)" value={money(d.netProfitYtd)} hint={`Revenue ${money(d.revenueYtd)}`} icon={<IconTrendingUp size={17} stroke={1.7} />} tone="success" />
            <StatTile label="Overdue" value={money(d.overdueAmount)} hint={`${d.overdueCount} invoices past due`} icon={<IconAlertTriangle size={17} stroke={1.7} />} tone={d.overdueCount > 0 ? 'danger' : 'default'} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <SectionCard title="Revenue — last 6 months" className="lg:col-span-2">
              <Sparkline data={d.revenueTrend.map((p) => p.revenue)} />
              <div className="mt-2 flex justify-between text-[11px] font-semibold text-dim">
                {d.revenueTrend.map((p) => <span key={p.month}>{monthLabel(p.month)}</span>)}
              </div>
            </SectionCard>
            <SectionCard title="This year">
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between"><span className="text-frost-dim">Revenue</span><span className="font-mono tabular-nums text-frost">{money(d.revenueYtd)}</span></div>
                <div className="flex justify-between"><span className="text-frost-dim">Expenses</span><span className="font-mono tabular-nums text-frost">{money(d.expensesYtd)}</span></div>
                <div className="flex justify-between border-t border-border pt-3 font-semibold"><span className="text-frost">Net profit</span><span className={`font-mono tabular-nums ${d.netProfitYtd >= 0 ? 'text-success' : 'text-danger'}`}>{money(d.netProfitYtd)}</span></div>
                <div className="flex justify-between"><span className="text-frost-dim">Payables</span><span className="font-mono tabular-nums text-frost">{money(d.accountsPayable)}</span></div>
              </div>
            </SectionCard>
          </div>
        </div>
      )}
    </AppShell>
  );
}
