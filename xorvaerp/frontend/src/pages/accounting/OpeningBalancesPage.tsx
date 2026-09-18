import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconAdjustments } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type Account } from '../../api/accounting.api';
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
const money = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayStr = () => new Date().toISOString().slice(0, 10);

interface Row { debit: string; credit: string; }

export default function OpeningBalancesPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [asOf, setAsOf] = useState(todayStr());
  const [posted, setPosted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, j] = await Promise.all([
        accountingApi.listAccounts(companyId, false),
        accountingApi.listJournals(companyId),
      ]);
      setAccounts(a.data.data ?? []);
      setPosted((j.data.data ?? []).some((x) => x.sourceType === 'Opening'));
    } catch (e) { toast.error(err(e, 'Failed to load accounts.')); }
    finally { setLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  const set = (id: string, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [id]: { ...(r[id] ?? { debit: '', credit: '' }), ...patch } }));

  const totals = useMemo(() => {
    let d = 0, c = 0;
    for (const id of Object.keys(rows)) { d += parseFloat(rows[id]?.debit) || 0; c += parseFloat(rows[id]?.credit) || 0; }
    return { d, c, diff: Math.round((d - c) * 100) / 100 };
  }, [rows]);

  const submit = async () => {
    const lines = accounts
      .map((a) => ({ accountId: a.id, debit: parseFloat(rows[a.id]?.debit) || 0, credit: parseFloat(rows[a.id]?.credit) || 0 }))
      .filter((l) => l.debit || l.credit);
    if (lines.length === 0) return toast.error('Enter at least one opening balance.');
    setSaving(true);
    try {
      await accountingApi.postOpeningBalances({ companyId, asOf, lines });
      toast.success('Opening balances posted.');
      await load();
    } catch (e) { toast.error(err(e, 'Failed to post opening balances.')); setSaving(false); }
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[26px] font-semibold tracking-tight text-frost">Opening Balances</h1>
          <p className="mt-1 text-sm text-frost-dim">One-time starting balances when migrating in. The difference posts to Retained Earnings.</p>
        </div>
        {!posted && <Field label="As at" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : accounts.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconAdjustments size={38} stroke={1.2} className="text-primary" />
          <p className="text-frost-dim">Create the chart of accounts first.</p>
        </Card>
      ) : posted ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconAdjustments size={38} stroke={1.2} className="text-success" />
          <p className="text-frost">Opening balances have already been posted.</p>
          <p className="text-sm text-frost-dim">They appear as an "Opening" entry in Journals and are reflected across the reports.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border">
                <tr><th className="px-4 py-3 w-24">Code</th><th className="px-4 py-3">Account</th><th className="px-4 py-3 text-right w-40">Debit</th><th className="px-4 py-3 text-right w-40">Credit</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {accounts.map((a) => (
                  <tr key={a.id} className="hover:bg-hover">
                    <td className="px-4 py-2 font-mono text-xs text-frost-dim">{a.code}</td>
                    <td className="px-4 py-2 text-frost">{a.name}</td>
                    <td className="px-4 py-2">
                      <input className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-right text-sm text-frost"
                        inputMode="decimal" placeholder="0.00" value={rows[a.id]?.debit ?? ''}
                        onChange={(e) => set(a.id, { debit: e.target.value, credit: '' })} />
                    </td>
                    <td className="px-4 py-2">
                      <input className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-right text-sm text-frost"
                        inputMode="decimal" placeholder="0.00" value={rows[a.id]?.credit ?? ''}
                        onChange={(e) => set(a.id, { credit: e.target.value, debit: '' })} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border font-semibold text-frost">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>Totals</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{money(totals.d)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{money(totals.c)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <span className="text-sm text-frost-dim">
              {totals.diff === 0
                ? 'Balanced.'
                : `Difference ${money(Math.abs(totals.diff))} → Retained Earnings (${totals.diff > 0 ? 'credit' : 'debit'}).`}
            </span>
            <Button loading={saving} onClick={() => void submit()}>Post opening balances</Button>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
