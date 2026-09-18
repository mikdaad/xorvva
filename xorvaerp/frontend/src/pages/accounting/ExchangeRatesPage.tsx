import { useCallback, useEffect, useState } from 'react';
import { IconCurrencyDollar, IconPlus, IconTrash, IconRefresh } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type ExchangeRate } from '../../api/accounting.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Field, Spinner } from '../../components/ui';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};
const today = () => new Date().toISOString().slice(0, 10);

export default function ExchangeRatesPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [rows, setRows] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [currency, setCurrency] = useState('USD');
  const [date, setDate] = useState(today());
  const [rate, setRate] = useState('');

  const [revalDate, setRevalDate] = useState(today());
  const [revaluing, setRevaluing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await accountingApi.listExchangeRates(companyId)).data.data ?? []); }
    catch (e) { toast.error(err(e, 'Failed to load exchange rates.')); }
    finally { setLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    const r = parseFloat(rate);
    if (!currency.trim() || currency.trim().length !== 3) return toast.error('Enter a 3-letter currency code (e.g. USD).');
    if (!(r > 0)) return toast.error('Rate must be greater than zero.');
    setSaving(true);
    try {
      await accountingApi.upsertExchangeRate({ companyId, currencyCode: currency.trim().toUpperCase(), rateDate: date, rate: r });
      toast.success('Exchange rate saved.');
      setRate('');
      await load();
    } catch (e) { toast.error(err(e, 'Failed to save rate.')); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try { await accountingApi.deleteExchangeRate(id, companyId); await load(); }
    catch (e) { toast.error(err(e, 'Failed to remove rate.')); }
    finally { setBusyId(null); }
  };

  const revalue = async () => {
    setRevaluing(true);
    try {
      const res = await accountingApi.revalueFx({ companyId, asOfDate: revalDate });
      toast.success(res.data.data?.message ?? 'FX revaluation complete.');
    } catch (e) { toast.error(err(e, 'Failed to run FX revaluation.')); }
    finally { setRevaluing(false); }
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight text-frost">Exchange Rates</h1>
        <p className="mt-1 text-sm text-frost-dim">
          Base-currency value of 1 unit of each foreign currency. Invoices, bills and payments use the
          latest rate on or before their date (you can also override the rate on a document).
        </p>
      </div>

      <Card className="mb-6 max-w-3xl">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-frost">
          <IconCurrencyDollar size={18} stroke={1.6} className="text-primary" /> Add / update a rate
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[7rem_1fr_1fr_auto] sm:items-end">
          <Field label="Currency" placeholder="USD" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value)} />
          <Field label="Effective date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Field label="Rate (base per 1 unit)" type="number" step="0.000001" placeholder="3.6725" value={rate} onChange={(e) => setRate(e.target.value)} />
          <Button loading={saving} onClick={() => void add()}><IconPlus size={16} stroke={1.6} /> Save</Button>
        </div>
      </Card>

      <Card className="mb-6 max-w-3xl">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-frost">
          <IconRefresh size={18} stroke={1.6} className="text-primary" /> Period-end revaluation
        </div>
        <p className="mb-4 text-xs text-dim">
          Restates open foreign receivables &amp; payables to the rate on this date, booking the difference to
          Unrealized FX Gain/Loss. The entry auto-reverses the next day, so it never clashes with the realized
          gain/loss when the document is actually settled.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="As of date" type="date" value={revalDate} onChange={(e) => setRevalDate(e.target.value)} />
          <Button variant="secondary" loading={revaluing} onClick={() => void revalue()}>
            <IconRefresh size={16} stroke={1.6} /> Run revaluation
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <IconCurrencyDollar size={36} stroke={1.2} className="text-dim" />
          <p className="text-frost-dim">No exchange rates yet. Add one above to invoice in a foreign currency.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-4 py-3">Currency</th><th className="px-4 py-3">Effective date</th>
                  <th className="px-4 py-3 text-right">Rate</th><th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-hover">
                    <td className="px-4 py-3 font-semibold text-frost">{r.currencyCode}</td>
                    <td className="px-4 py-3 text-frost-dim">{new Date(r.rateDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-frost-dim">{r.rate}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" className="text-dim hover:text-danger disabled:opacity-30"
                        disabled={busyId === r.id} onClick={() => void remove(r.id)}>
                        <IconTrash size={16} stroke={1.6} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
