import { useCallback, useEffect, useState } from 'react';
import { IconPlus, IconReceiptTax } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type TaxRate } from '../../api/accounting.api';
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

export default function TaxRatesPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [rows, setRows] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await accountingApi.listTaxRates(companyId); setRows(r.data.data ?? []); }
    catch (e) { toast.error(err(e, 'Failed to load tax rates.')); }
    finally { setLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  const seed = async () => {
    setSeeding(true);
    try { await accountingApi.seedTaxRates(companyId); toast.success('UAE tax rates added.'); await load(); }
    catch (e) { toast.error(err(e, 'Failed to seed tax rates.')); }
    finally { setSeeding(false); }
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-frost">Tax Rates</h1>
          <p className="mt-1 text-sm text-frost-dim">VAT rates used on invoices and bills.</p>
        </div>
        {rows.length > 0 && <Button onClick={() => setCreateOpen(true)}><IconPlus size={18} stroke={1.6} /> New rate</Button>}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconReceiptTax size={38} stroke={1.2} className="text-primary" />
          <p className="text-frost-dim">No tax rates yet. Add the UAE defaults (5% Standard, 0% Zero-rated, Exempt).</p>
          <Button loading={seeding} onClick={() => void seed()}>Add UAE tax rates</Button>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-dim">
                <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3 text-right">Rate</th><th className="px-4 py-3">Applies to</th><th className="px-4 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((t) => (
                  <tr key={t.id} className="hover:bg-hover">
                    <td className="px-4 py-2.5 text-frost">{t.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{t.rate}%</td>
                    <td className="px-4 py-2.5 text-frost-dim">{t.appliesTo}</td>
                    <td className="px-4 py-2.5">{t.isActive ? <Pill tone="ok">Active</Pill> : <Pill tone="bad">Inactive</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {createOpen && <CreateTaxModal companyId={companyId} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); void load(); }} />}
    </AppShell>
  );
}

function CreateTaxModal({ companyId, onClose, onDone }: { companyId?: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', rate: '5', appliesTo: 'Both' });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!f.name.trim()) return toast.error('Name is required.');
    setLoading(true);
    try {
      await accountingApi.createTaxRate({ companyId, name: f.name, rate: parseFloat(f.rate) || 0, appliesTo: f.appliesTo });
      toast.success('Tax rate created.'); onDone();
    } catch (e) { toast.error(err(e, 'Failed to create tax rate.')); setLoading(false); }
  };

  return (
    <Modal open title="New tax rate" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Name" value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. VAT 5%" />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Rate (%)" type="number" value={f.rate} onChange={(e) => setF((s) => ({ ...s, rate: e.target.value }))} />
          <SelectField label="Applies to" options={['Sales', 'Purchase', 'Both'].map((v) => ({ value: v, label: v }))}
            value={f.appliesTo} onChange={(e) => setF((s) => ({ ...s, appliesTo: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}
