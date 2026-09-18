import { useCallback, useEffect, useState } from 'react';
import { IconReceiptTax } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type VatReturn } from '../../api/accounting.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Card, Field, Spinner } from '../../components/ui';

const money = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function VatReturnPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<VatReturn | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await accountingApi.getVatReturn(companyId, from, to); setData(r.data.data ?? null); }
    catch (e) { const ax = e as AxiosError<ApiResponse<never>>; toast.error(ax.response?.data?.message ?? 'Failed to load VAT return.'); }
    finally { setLoading(false); }
  }, [companyId, from, to, toast]);
  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-frost">VAT Return</h1>
          <p className="mt-1 text-sm text-frost-dim">Output VAT (on sales) minus input VAT (on purchases) for the period.</p>
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
          <IconReceiptTax size={38} stroke={1.2} className="text-primary" /><p className="text-frost-dim">No data.</p>
        </Card>
      ) : (
        <Card className="mx-auto max-w-lg overflow-hidden p-0">
          <div className="flex justify-between px-5 py-4 text-sm">
            <span className="text-frost-dim">Output VAT <span className="text-dim">(collected on sales)</span></span>
            <span className="font-mono tabular-nums text-frost">{money(data.outputVat)}</span>
          </div>
          <div className="flex justify-between border-t border-border px-5 py-4 text-sm">
            <span className="text-frost-dim">Input VAT <span className="text-dim">(paid on purchases)</span></span>
            <span className="font-mono tabular-nums text-frost">({money(data.inputVat)})</span>
          </div>
          <div className={`flex justify-between border-t-2 border-border px-5 py-4 text-base font-bold ${data.netPayable >= 0 ? 'text-frost' : 'text-success'}`}>
            <span>{data.netPayable >= 0 ? 'Net VAT payable to FTA' : 'Net VAT reclaimable'}</span>
            <span className="font-mono tabular-nums">{money(Math.abs(data.netPayable))}</span>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
