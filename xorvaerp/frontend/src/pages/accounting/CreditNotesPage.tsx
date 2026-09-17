import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconPlus, IconTrash, IconArrowBackUp } from '@tabler/icons-react';
import { AxiosError } from 'axios';
import { accountingApi, type Contact, type CreditNoteSummary, type CreditNoteLineInput, type TaxRate } from '../../api/accounting.api';
import type { ApiResponse } from '../../api/auth.api';
import { useAuth } from '../../stores/AuthContext';
import { useCompany } from '../../stores/CompanyContext';
import { useToast } from '../../stores/ToastContext';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Field, Modal, SelectField, Spinner } from '../../components/ui';

const err = (e: unknown, f: string) => {
  const ax = e as AxiosError<ApiResponse<never>>;
  return ax.response?.data?.errors?.join(' ') ?? ax.response?.data?.message ?? f;
};
const money = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

export default function CreditNotesPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();
  const toast = useToast();
  const companyId = user?.role === 'SuperAdmin' ? activeCompanyId : undefined;

  const [rows, setRows] = useState<CreditNoteSummary[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, cu, t] = await Promise.all([
        accountingApi.listCreditNotes(companyId),
        accountingApi.listContacts(companyId, 'Customer'),
        accountingApi.listTaxRates(companyId),
      ]);
      setRows(c.data.data ?? []);
      setCustomers(cu.data.data ?? []);
      setTaxRates(t.data.data ?? []);
    } catch (e) { toast.error(err(e, 'Failed to load credit notes.')); }
    finally { setLoading(false); }
  }, [companyId, toast]);
  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-frost">Credit Notes</h1>
          <p className="mt-1 text-sm text-frost-dim">Customer returns &amp; adjustments — posts the reverse of a sale.</p>
        </div>
        <Button disabled={customers.length === 0} onClick={() => setCreateOpen(true)}><IconPlus size={18} stroke={1.6} /> New credit note</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <IconArrowBackUp size={38} stroke={1.2} className="text-primary" />
          <p className="text-frost-dim">{customers.length === 0 ? 'Add a customer first.' : 'No credit notes yet.'}</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-dim">
                <tr><th className="px-4 py-3">Number</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-hover">
                    <td className="px-4 py-2.5 font-mono text-xs text-frost">{c.number}</td>
                    <td className="px-4 py-2.5 text-frost-dim">{c.contactName}</td>
                    <td className="px-4 py-2.5 text-frost-dim">{new Date(c.date).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-frost-dim">{money(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {createOpen && (
        <CreateModal companyId={companyId} customers={customers} taxRates={taxRates}
          onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); void load(); }} />
      )}
    </AppShell>
  );
}

interface LineRow { description: string; quantity: string; unitPrice: string; taxRateId: string; }
const blankLine = (): LineRow => ({ description: '', quantity: '1', unitPrice: '', taxRateId: '' });

function CreateModal({ companyId, customers, taxRates, onClose, onDone }: {
  companyId?: string; customers: Contact[]; taxRates: TaxRate[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [contactId, setContactId] = useState(customers[0]?.id ?? '');
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<LineRow[]>([blankLine()]);
  const [loading, setLoading] = useState(false);

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
    const payload: CreditNoteLineInput[] = lines
      .filter((l) => l.description.trim() && (parseFloat(l.quantity) || 0) > 0)
      .map((l) => ({ description: l.description.trim(), quantity: parseFloat(l.quantity) || 0, unitPrice: parseFloat(l.unitPrice) || 0, taxRateId: l.taxRateId || undefined }));
    if (!contactId) return toast.error('Choose a customer.');
    if (payload.length === 0) return toast.error('Add at least one line.');
    setLoading(true);
    try {
      await accountingApi.createCreditNote({ companyId, contactId, date, reason: reason || undefined, lines: payload });
      toast.success('Credit note posted.');
      onDone();
    } catch (e) { toast.error(err(e, 'Failed to create credit note.')); setLoading(false); }
  };

  return (
    <Modal open title="New credit note" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Customer" options={customers.map((c) => ({ value: c.id, label: c.name }))} value={contactId} onChange={(e) => setContactId(e.target.value)} />
          <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_4rem_6rem_7rem_6rem_1.5rem] gap-2 text-xs uppercase text-dim">
            <span>Description</span><span className="text-right">Qty</span><span className="text-right">Price</span><span>Tax</span><span className="text-right">Amount</span><span />
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_4rem_6rem_7rem_6rem_1.5rem] items-center gap-2">
              <Field value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Returned item" />
              <input className="rounded-lg border border-border bg-surface px-2 py-2 text-right text-sm text-frost" inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              <input className="rounded-lg border border-border bg-surface px-2 py-2 text-right text-sm text-frost" inputMode="decimal" placeholder="0.00" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
              <SelectField options={taxOptions} value={l.taxRateId} onChange={(e) => setLine(i, { taxRateId: e.target.value })} />
              <span className="text-right font-mono text-sm tabular-nums text-frost-dim">{money(calc[i].amount)}</span>
              <button type="button" className="text-dim hover:text-danger disabled:opacity-30" disabled={lines.length <= 1} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}><IconTrash size={16} stroke={1.6} /></button>
            </div>
          ))}
          <button type="button" className="self-start text-sm text-primary hover:underline" onClick={() => setLines((ls) => [...ls, blankLine()])}>+ Add line</button>
        </div>

        <div className="ml-auto w-64 space-y-1 rounded-lg bg-surface px-4 py-3 text-sm">
          <div className="flex justify-between text-frost-dim"><span>Subtotal</span><span className="font-mono tabular-nums">{money(subTotal)}</span></div>
          <div className="flex justify-between text-frost-dim"><span>VAT</span><span className="font-mono tabular-nums">{money(taxTotal)}</span></div>
          <div className="flex justify-between border-t border-border pt-1 font-semibold text-frost"><span>Total</span><span className="font-mono tabular-nums">{money(subTotal + taxTotal)}</span></div>
        </div>

        <Field label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={() => void submit()}>Post credit note</Button>
        </div>
      </div>
    </Modal>
  );
}
