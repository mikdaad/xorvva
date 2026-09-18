import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconPlus, IconTrash, IconReceipt2 } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type Contact, type BillSummary, type BillLineInput, type TaxRate } from '../../api/accounting.api';
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
const STATUS_TONE: Record<string, 'brand' | 'ok' | 'warn' | 'neutral' | 'bad'> = {
  Draft: 'neutral', Posted: 'brand', PartiallyPaid: 'warn', Paid: 'ok', Voided: 'bad',
};

export default function BillsPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [rows, setRows] = useState<BillSummary[]>([]);
  const [suppliers, setSuppliers] = useState<Contact[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, s, t] = await Promise.all([
        accountingApi.listBills(companyId),
        accountingApi.listContacts(companyId, 'Supplier'),
        accountingApi.listTaxRates(companyId),
      ]);
      setRows(b.data.data ?? []);
      setSuppliers(s.data.data ?? []);
      setTaxRates(t.data.data ?? []);
    } catch (e) { toast.error(err(e, 'Failed to load bills.')); }
    finally { setLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  const post = async (id: string) => {
    setBusyId(id);
    try { const res = await accountingApi.postBill(id, companyId); toast.success(res.data.message ?? 'Bill posted — journal created.'); await load(); }
    catch (e) { toast.error(err(e, 'Failed to post bill.')); }
    finally { setBusyId(null); }
  };
  const voidBill = async (id: string) => {
    setBusyId(id);
    try { await accountingApi.voidBill(id, { companyId }); toast.success('Bill voided.'); await load(); }
    catch (e) { toast.error(err(e, 'Failed to void bill.')); }
    finally { setBusyId(null); }
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[26px] font-semibold tracking-tight text-frost">Bills</h1>
          <p className="mt-1 text-sm text-frost-dim">Supplier bills. Posting a bill books the expense and VAT automatically.</p>
        </div>
        <Button disabled={suppliers.length === 0} onClick={() => setCreateOpen(true)}><IconPlus size={18} stroke={1.6} /> New bill</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconReceipt2 size={38} stroke={1.2} className="text-primary" />
          <p className="text-frost-dim">{suppliers.length === 0 ? 'Add a supplier (Contacts) first, then enter a bill.' : 'No bills yet.'}</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-4 py-3">Number</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Ref</th>
                  <th className="px-4 py-3">Date</th><th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Status</th><th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((b) => (
                  <tr key={b.id} className="hover:bg-hover">
                    <td className="px-4 py-3 font-mono text-xs text-frost">{b.number}</td>
                    <td className="px-4 py-3 text-frost-dim">{b.contactName}</td>
                    <td className="px-4 py-3 text-dim">{b.supplierReference ?? '—'}</td>
                    <td className="px-4 py-3 text-frost-dim">{new Date(b.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-frost-dim">{new Date(b.dueDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-frost-dim">{b.currency !== 'AED' ? `${b.currency} ` : ''}{money(b.total)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-frost-dim">{b.currency !== 'AED' ? `${b.currency} ` : ''}{money(b.balanceDue)}</td>
                    <td className="px-4 py-3"><Pill tone={STATUS_TONE[b.status] ?? 'neutral'}>{b.status}</Pill></td>
                    <td className="px-4 py-3 text-right">
                      {b.status === 'Draft' && <Button className="px-3 py-1.5 text-xs" loading={busyId === b.id} onClick={() => void post(b.id)}>Post</Button>}
                      {b.status === 'Posted' && <Button variant="ghost" className="px-3 py-1.5 text-xs" loading={busyId === b.id} onClick={() => void voidBill(b.id)}>Void</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {createOpen && (
        <CreateBillModal companyId={companyId} suppliers={suppliers} taxRates={taxRates}
          onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); void load(); }} />
      )}
    </AppShell>
  );
}

interface LineRow { description: string; quantity: string; unitPrice: string; taxRateId: string; }
const blankLine = (): LineRow => ({ description: '', quantity: '1', unitPrice: '', taxRateId: '' });

function CreateBillModal({ companyId, suppliers, taxRates, onClose, onDone }: {
  companyId?: string; suppliers: Contact[]; taxRates: TaxRate[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [contactId, setContactId] = useState(suppliers[0]?.id ?? '');
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState('');
  const [supplierReference, setSupplierReference] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [fxRate, setFxRate] = useState('');
  const [lines, setLines] = useState<LineRow[]>([blankLine()]);
  const [loading, setLoading] = useState(false);
  const isForeign = currency.trim().toUpperCase() !== 'AED' && currency.trim() !== '';

  const rateOf = (id: string) => taxRates.find((t) => t.id === id)?.rate ?? 0;
  const taxOptions = useMemo(() => [{ value: '', label: 'No tax' }, ...taxRates.map((t) => ({ value: t.id, label: t.name }))], [taxRates]);
  const setLine = (i: number, patch: Partial<LineRow>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const calc = lines.map((l) => {
    const amount = (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0);
    return { amount, tax: amount * rateOf(l.taxRateId) / 100 };
  });
  const subTotal = calc.reduce((s, c) => s + c.amount, 0);
  const taxTotal = calc.reduce((s, c) => s + c.tax, 0);

  const submit = async () => {
    const payload: BillLineInput[] = lines
      .filter((l) => l.description.trim() && (parseFloat(l.quantity) || 0) > 0)
      .map((l) => ({ description: l.description.trim(), quantity: parseFloat(l.quantity) || 0, unitPrice: parseFloat(l.unitPrice) || 0, taxRateId: l.taxRateId || undefined }));
    if (!contactId) return toast.error('Choose a supplier.');
    if (payload.length === 0) return toast.error('Add at least one line.');
    const cur = currency.trim().toUpperCase() || 'AED';
    const rateNum = fxRate.trim() ? Number(fxRate) : undefined;
    if (cur !== 'AED' && rateNum !== undefined && !(rateNum > 0)) return toast.error('Exchange rate must be greater than zero.');
    setLoading(true);
    try {
      await accountingApi.createBill({
        companyId, contactId, date, dueDate: dueDate || undefined, supplierReference: supplierReference || undefined,
        currency: cur, exchangeRate: cur !== 'AED' ? rateNum : undefined, lines: payload,
      });
      toast.success('Bill created (draft). Post it to book the expense.');
      onDone();
    } catch (e) { toast.error(err(e, 'Failed to create bill.')); setLoading(false); }
  };

  const cell = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-frost placeholder:text-dim focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary';
  const lineGrid = 'grid grid-cols-[minmax(9rem,1fr)_4rem_7rem_9rem_7rem_2rem] items-center gap-2';

  return (
    <Modal open title="New bill" onClose={onClose} size="3xl">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Supplier" options={suppliers.map((c) => ({ value: c.id, label: c.name }))} value={contactId} onChange={(e) => setContactId(e.target.value)} />
          <Field label="Supplier ref (their invoice #)" value={supplierReference} onChange={(e) => setSupplierReference(e.target.value)} />
          <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Field label="Due date (optional)" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Field label="Currency" placeholder="AED" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value)} />
          {isForeign && (
            <Field label="Exchange rate (optional)" type="number" step="0.000001" placeholder="latest on file"
              value={fxRate} onChange={(e) => setFxRate(e.target.value)} />
          )}
        </div>
        {isForeign && (
          <p className="-mt-2 text-xs text-dim">
            Amounts are in {currency.trim().toUpperCase()}; the ledger posts in AED at this rate (blank = latest Exchange Rate on file).
          </p>
        )}

        <div className="flex flex-col gap-2">
          <div className="mb-1 text-sm font-semibold text-frost">Line items</div>
          <div className={`${lineGrid} px-1 text-[11px] font-semibold uppercase tracking-wide text-dim`}>
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit price</span>
            <span>Tax</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          {lines.map((l, i) => (
            <div key={i} className={lineGrid}>
              <input className={cell} placeholder="Expense or item"
                value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
              <input className={`${cell} text-right`} inputMode="decimal" placeholder="1"
                value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              <input className={`${cell} text-right`} inputMode="decimal" placeholder="0.00"
                value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
              <SelectField options={taxOptions} value={l.taxRateId} onChange={(e) => setLine(i, { taxRateId: e.target.value })} />
              <div className="text-right font-mono text-sm tabular-nums text-frost">{money(calc[i].amount)}</div>
              <button type="button" aria-label="Remove line"
                className="flex justify-center text-dim transition-colors hover:text-danger disabled:opacity-30"
                disabled={lines.length <= 1} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}><IconTrash size={16} stroke={1.6} /></button>
            </div>
          ))}
          <button type="button" className="self-start text-sm text-primary hover:underline" onClick={() => setLines((ls) => [...ls, blankLine()])}>+ Add line</button>
        </div>

        <div className="ml-auto w-64 space-y-1 rounded-lg bg-surface px-4 py-3 text-sm">
          <div className="flex justify-between text-frost-dim"><span>Subtotal</span><span className="font-mono tabular-nums">{money(subTotal)}</span></div>
          <div className="flex justify-between text-frost-dim"><span>VAT</span><span className="font-mono tabular-nums">{money(taxTotal)}</span></div>
          <div className="flex justify-between border-t border-border pt-1 font-semibold text-frost"><span>Total</span><span className="font-mono tabular-nums">{money(subTotal + taxTotal)}</span></div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Create draft</Button>
        </div>
      </div>
    </Modal>
  );
}
