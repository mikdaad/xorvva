import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconPlus, IconBuildingWarehouse, IconCalculator } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type Account, type FixedAsset } from '../../api/accounting.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Field, Modal, SelectField, Spinner } from '../../components/ui';
import { Pill } from '../../components/dashboard-ui';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};
const money = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function FixedAssetsPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [rows, setRows] = useState<FixedAsset[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [depOpen, setDepOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, acc] = await Promise.all([
        accountingApi.listFixedAssets(companyId),
        accountingApi.listAccounts(companyId, false),
      ]);
      setRows(a.data.data ?? []);
      setAccounts(acc.data.data ?? []);
    } catch (e) { toast.error(err(e, 'Failed to load fixed assets.')); }
    finally { setLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[26px] font-semibold tracking-tight text-frost">Fixed Assets</h1>
          <p className="mt-1 text-sm text-frost-dim">Asset register with straight-line depreciation posted to the ledger.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={rows.length === 0} onClick={() => setDepOpen(true)}>
            <IconCalculator size={17} stroke={1.6} /> Run depreciation
          </Button>
          <Button disabled={accounts.length === 0} onClick={() => setCreateOpen(true)}><IconPlus size={18} stroke={1.6} /> New asset</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconBuildingWarehouse size={38} stroke={1.2} className="text-primary" />
          <p className="text-frost-dim">{accounts.length === 0 ? 'Create the chart of accounts first.' : 'No fixed assets registered yet.'}</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-4 py-3">Asset</th><th className="px-4 py-3">Acquired</th>
                  <th className="px-4 py-3 text-right">Cost</th><th className="px-4 py-3 text-right">Accum. dep.</th>
                  <th className="px-4 py-3 text-right">Book value</th><th className="px-4 py-3">Life</th><th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((a) => (
                  <tr key={a.id} className="hover:bg-hover">
                    <td className="px-4 py-3 text-frost">{a.name}{a.code ? <span className="ml-2 font-mono text-xs text-dim">{a.code}</span> : null}</td>
                    <td className="px-4 py-3 text-frost-dim">{new Date(a.acquisitionDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-frost-dim">{money(a.cost)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-frost-dim">{money(a.accumulatedDepreciation)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-frost">{money(a.bookValue)}</td>
                    <td className="px-4 py-3 text-frost-dim">{a.usefulLifeMonths} mo</td>
                    <td className="px-4 py-3">{a.isDisposed ? <Pill tone="neutral">Disposed</Pill> : a.bookValue <= a.salvageValue ? <Pill tone="warn">Fully dep.</Pill> : <Pill tone="ok">Active</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {createOpen && <CreateModal companyId={companyId} accounts={accounts} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); void load(); }} />}
      {depOpen && <DepreciationModal companyId={companyId} onClose={() => setDepOpen(false)} onDone={() => { setDepOpen(false); void load(); }} />}
    </AppShell>
  );
}

function CreateModal({ companyId, accounts, onClose, onDone }: {
  companyId?: string; accounts: Account[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const assetAccts = useMemo(() => accounts.filter((a) => a.accountType === 'Asset'), [accounts]);
  const expenseAccts = useMemo(() => accounts.filter((a) => a.accountType === 'Expense'), [accounts]);
  const [f, setF] = useState({
    name: '', code: '', category: '', acquisitionDate: today(), cost: '', salvageValue: '0', usefulLifeMonths: '36',
    assetAccountId: assetAccts.find((a) => a.accountSubType === 'FixedAsset')?.id ?? assetAccts[0]?.id ?? '',
    accumulatedDepreciationAccountId: assetAccts.find((a) => a.name.toLowerCase().includes('depreciation'))?.id ?? assetAccts[0]?.id ?? '',
    depreciationExpenseAccountId: expenseAccts.find((a) => a.name.toLowerCase().includes('depreciation'))?.id ?? expenseAccts[0]?.id ?? '',
  });
  const [loading, setLoading] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const opt = (list: Account[]) => list.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }));

  const submit = async () => {
    if (!f.name.trim() || !(parseFloat(f.cost) > 0)) return toast.error('Name and a positive cost are required.');
    setLoading(true);
    try {
      await accountingApi.createFixedAsset({
        companyId, name: f.name, code: f.code || undefined, category: f.category || undefined,
        acquisitionDate: f.acquisitionDate, cost: parseFloat(f.cost) || 0, salvageValue: parseFloat(f.salvageValue) || 0,
        usefulLifeMonths: parseInt(f.usefulLifeMonths, 10) || 1,
        assetAccountId: f.assetAccountId, accumulatedDepreciationAccountId: f.accumulatedDepreciationAccountId,
        depreciationExpenseAccountId: f.depreciationExpenseAccountId,
      });
      toast.success('Fixed asset registered.');
      onDone();
    } catch (e) { toast.error(err(e, 'Failed to register asset.')); setLoading(false); }
  };

  return (
    <Modal open title="New fixed asset" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" value={f.name} onChange={(e) => set('name', e.target.value)} />
          <Field label="Category (optional)" value={f.category} onChange={(e) => set('category', e.target.value)} />
          <Field label="Acquisition date" type="date" value={f.acquisitionDate} onChange={(e) => set('acquisitionDate', e.target.value)} />
          <Field label="Useful life (months)" type="number" value={f.usefulLifeMonths} onChange={(e) => set('usefulLifeMonths', e.target.value)} />
          <Field label="Cost" type="number" value={f.cost} onChange={(e) => set('cost', e.target.value)} />
          <Field label="Salvage value" type="number" value={f.salvageValue} onChange={(e) => set('salvageValue', e.target.value)} />
        </div>
        <SelectField label="Asset account" options={opt(assetAccts)} value={f.assetAccountId} onChange={(e) => set('assetAccountId', e.target.value)} />
        <SelectField label="Accumulated depreciation account" options={opt(assetAccts)} value={f.accumulatedDepreciationAccountId} onChange={(e) => set('accumulatedDepreciationAccountId', e.target.value)} />
        <SelectField label="Depreciation expense account" options={opt(expenseAccts)} value={f.depreciationExpenseAccountId} onChange={(e) => set('depreciationExpenseAccountId', e.target.value)} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Register asset</Button>
        </div>
      </div>
    </Modal>
  );
}

function DepreciationModal({ companyId, onClose, onDone }: { companyId?: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const r = await accountingApi.runDepreciation({ companyId, year, month });
      toast.success(r.data.message ?? 'Depreciation posted.');
      onDone();
    } catch (e) { toast.error(err(e, 'Failed to run depreciation.')); setLoading(false); }
  };

  return (
    <Modal open title="Run depreciation" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-frost-dim">Posts one month of straight-line depreciation for all active assets (DR Depreciation Expense / CR Accumulated Depreciation).</p>
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Month" options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} value={String(month)} onChange={(e) => setMonth(Number(e.target.value))} />
          <Field label="Year" type="number" value={String(year)} onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Run</Button>
        </div>
      </div>
    </Modal>
  );
}
